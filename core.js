// 代码搜索 / Code Search — 核心逻辑
// 给任意 textarea 或 CodeMirror 6 编辑器加一条搜索栏：搜索、高亮、上一个/下一个、光标定位、回顶、到底。
// 这个文件不依赖酒馆本体，方便单独测试；酒馆相关的接入（找哪些框、设置面板）在 index.js。

const MAX_MATCHES = 5000;
const INSTANCES = new Map();          // host(textarea 或 .cm-editor) -> CodeSearch
const CLOSED_BY_USER = new WeakSet(); // 临时搜索栏被用户关掉的 host，不再自动附加

const DEFAULT_STRINGS = {
    placeholder: '搜索…',
    caseTitle: '区分大小写',
    regexTitle: '正则表达式',
    prevTitle: '上一个 (Shift+Enter)',
    nextTitle: '下一个 (Enter)',
    gotoTitle: '光标跳到这一处，开始编辑 (Esc)',
    topTitle: '回到顶部',
    bottomTitle: '跳到底部',
    closeTitle: '收起搜索栏',
    openTitle: '搜索 (Ctrl+F)',
    noResult: '无结果',
    badRegex: '正则无效',
    line: (n) => `行 ${n}`,
    tooMany: '+',
};

export function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function debounce(fn, wait) {
    let timer = null;
    const wrapped = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { timer = null; fn(...args); }, wait);
    };
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
}

function rafThrottle(fn) {
    let pending = false;
    return () => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; fn(); });
    };
}

function isScrollable(el) {
    if (!(el instanceof HTMLElement)) return false;
    const { overflowY } = getComputedStyle(el);
    return (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && el.scrollHeight > el.clientHeight + 1;
}

/** 调整所有可滚动祖先和窗口，让 getRect() 返回的区域在视野内（尽量居中）。 */
function revealRect(startEl, getRect) {
    let el = startEl;
    while (el && el !== document.body) {
        if (isScrollable(el)) {
            const rect = getRect();
            const box = el.getBoundingClientRect();
            if (rect.top < box.top || rect.bottom > box.bottom) {
                el.scrollTop += (rect.top - box.top) - (box.height / 2 - rect.height / 2);
            }
        }
        el = el.parentElement;
    }
    const rect = getRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
        window.scrollBy(0, rect.top - window.innerHeight / 2 + rect.height / 2);
    }
}

/** 把一个 position:absolute 的元素放到视口矩形 rect 的位置上（相对它自己的 offsetParent 计算，不依赖父元素的定位方式）。 */
function placeAbsolute(el, rect) {
    const op = el.offsetParent;
    if (!op) return;
    if (op === document.body || op === document.documentElement) {
        // 没有定位过的祖先：包含块是整个文档
        el.style.top = `${rect.top + window.scrollY}px`;
        el.style.left = `${rect.left + window.scrollX}px`;
        return;
    }
    const opRect = op.getBoundingClientRect();
    const cs = getComputedStyle(op);
    el.style.top = `${rect.top - opRect.top - (parseFloat(cs.borderTopWidth) || 0) + op.scrollTop}px`;
    el.style.left = `${rect.left - opRect.left - (parseFloat(cs.borderLeftWidth) || 0) + op.scrollLeft}px`;
}

/** 元素自己是不是 display:none（祖先隐藏不算，因为抽屉关着时也要先把搜索栏装好）。 */
function isSelfHidden(el) {
    return getComputedStyle(el).display === 'none';
}

function lineOf(text, index) {
    let line = 1;
    for (let i = 0; i < index; i++) {
        if (text.charCodeAt(i) === 10) line++;
    }
    return line;
}

/** 二分：第一个起点 >= pos 的匹配下标。 */
function lowerBound(matches, pos) {
    let lo = 0, hi = matches.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (matches[mid][0] < pos) lo = mid + 1; else hi = mid;
    }
    return lo;
}

// ---------------------------------------------------------------------------
// CSS Custom Highlight API：给 CodeMirror 里的匹配上色（Chrome 105+ / Safari 17.2+ / Firefox 140+）
// ---------------------------------------------------------------------------

const HL = (() => {
    try {
        if (typeof Highlight !== 'function' || !('highlights' in CSS)) return null;
        const all = new Highlight();
        const cur = new Highlight();
        all.priority = 1;
        cur.priority = 2;
        CSS.highlights.set('stcs-match', all);
        CSS.highlights.set('stcs-current', cur);
        return { all, cur };
    } catch {
        return null;
    }
})();

// ---------------------------------------------------------------------------
// 适配器：把 textarea 和 CodeMirror 的差异包起来
// ---------------------------------------------------------------------------

/** 原生 textarea：高亮是盖在上面的一层透明 div，只画匹配处的底色。 */
class TextareaAdapter {
    constructor(ta) {
        this.kind = 'textarea';
        this.host = ta;
        this.el = ta;
        this.marks = [];
        this.lastValue = null;
    }

    init(owner) {
        this.owner = owner;
        const overlay = document.createElement('div');
        overlay.className = 'stcs-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.hidden = true;
        this.overlay = overlay;
        this.el.after(overlay);

        this.onScroll = () => this.syncScroll();
        this.onInput = () => owner.onTextInputSoon();
        this.el.addEventListener('scroll', this.onScroll, { passive: true });
        this.el.addEventListener('input', this.onInput);
        if (typeof ResizeObserver === 'function') {
            this.ro = new ResizeObserver(() => owner.syncGeometry());
            this.ro.observe(this.el);
        }
    }

    focusTarget() { return this.el; }
    getText() { return this.el.value; }
    textToken() { return this.el.value; }
    caret() { return this.el.selectionStart || 0; }
    isHidden() { return isSelfHidden(this.el); }
    isVisible() { return !!(this.el.offsetWidth || this.el.offsetHeight); }

    /** 选中 [from,to)，并把它滚到文本框中间。 */
    select(from, to, { focus = false } = {}) {
        const ta = this.el;
        if (focus) ta.focus({ preventScroll: true });
        try { ta.setSelectionRange(from, to); } catch { /* 忽略 */ }
        const mark = this.marks[this.owner.current];
        if (mark) {
            this.syncGeometry();
            ta.scrollTop = Math.max(0, mark.offsetTop - ta.clientHeight / 2 + mark.offsetHeight / 2);
        }
        this.syncScroll();
    }

    matchRect() {
        const mark = this.marks[this.owner.current];
        return mark ? mark.getBoundingClientRect() : this.el.getBoundingClientRect();
    }

    scrollToEdge(edge) {
        const ta = this.el;
        const pos = edge === 'top' ? 0 : ta.value.length;
        ta.focus({ preventScroll: true });
        try { ta.setSelectionRange(pos, pos); } catch { /* 忽略 */ }
        ta.scrollTop = edge === 'top' ? 0 : ta.scrollHeight;
        this.syncScroll();
    }

    renderHighlights(matches, current) {
        const text = this.el.value;
        const frag = document.createDocumentFragment();
        this.marks = [];
        let pos = 0;
        for (let i = 0; i < matches.length; i++) {
            const [s, e] = matches[i];
            if (s > pos) frag.append(text.slice(pos, s));
            const mark = document.createElement('span');
            mark.className = i === current ? 'stcs-m stcs-cur' : 'stcs-m';
            mark.textContent = text.slice(s, e);
            frag.append(mark);
            this.marks.push(mark);
            pos = e;
        }
        // 结尾补一个零宽字符：textarea 末尾的换行会多显示一行，div 不会，补上才能对齐。
        frag.append(text.slice(pos) + '​');
        this.overlay.replaceChildren(frag);
        this.overlay.hidden = matches.length === 0;
        if (matches.length) this.syncGeometry();
    }

    setCurrent(prev, next) {
        this.marks[prev]?.classList.remove('stcs-cur');
        this.marks[next]?.classList.add('stcs-cur');
    }

    clearHighlights() {
        this.marks = [];
        this.overlay.replaceChildren();
        this.overlay.hidden = true;
    }

    /** 让高亮层和 textarea 完全重合：位置、尺寸、字体、内边距、边框、换行方式。 */
    syncGeometry() {
        if (this.overlay.hidden) return;
        const ta = this.el;
        const o = this.overlay.style;
        if (!this.isVisible()) {
            o.display = 'none';
            return;
        }
        o.display = '';
        const cs = getComputedStyle(ta);
        const bt = parseFloat(cs.borderTopWidth) || 0;
        const br = parseFloat(cs.borderRightWidth) || 0;
        const bb = parseFloat(cs.borderBottomWidth) || 0;
        const bl = parseFloat(cs.borderLeftWidth) || 0;
        const rect = ta.getBoundingClientRect();
        placeAbsolute(this.overlay, rect);
        o.width = `${ta.clientWidth + bl + br}px`;
        o.height = `${ta.clientHeight + bt + bb}px`;
        o.borderWidth = `${bt}px ${br}px ${bb}px ${bl}px`;
        o.borderRadius = cs.borderRadius;
        o.padding = cs.padding;
        o.fontFamily = cs.fontFamily;
        o.fontSize = cs.fontSize;
        o.fontWeight = cs.fontWeight;
        o.fontStyle = cs.fontStyle;
        o.fontVariant = cs.fontVariant;
        o.fontStretch = cs.fontStretch;
        o.lineHeight = cs.lineHeight;
        o.letterSpacing = cs.letterSpacing;
        o.wordSpacing = cs.wordSpacing;
        o.textTransform = cs.textTransform;
        o.textIndent = cs.textIndent;
        o.tabSize = cs.tabSize;
        o.direction = cs.direction;
        o.textAlign = cs.textAlign;
        o.whiteSpace = cs.whiteSpace === 'normal' || cs.whiteSpace === 'nowrap' ? 'pre-wrap' : cs.whiteSpace;
        o.overflowWrap = cs.overflowWrap === 'normal' ? 'break-word' : cs.overflowWrap;
        o.wordBreak = cs.wordBreak;
        this.syncScroll();
    }

    syncScroll() {
        if (this.overlay.hidden) return;
        this.overlay.scrollTop = this.el.scrollTop;
        this.overlay.scrollLeft = this.el.scrollLeft;
    }

    destroy() {
        this.ro?.disconnect();
        this.el.removeEventListener('scroll', this.onScroll);
        this.el.removeEventListener('input', this.onInput);
        this.overlay.remove();
    }
}

/** 从 .cm-editor 元素拿到 CodeMirror 6 的 EditorView（新版挂在 cmTile 上，旧版挂在 cmView 上）。 */
export function getCodeMirrorView(editorEl) {
    if (!(editorEl instanceof HTMLElement)) return null;
    const content = editorEl.querySelector(':scope > .cm-scroller > .cm-content') || editorEl.querySelector('.cm-content');
    if (!content) return null;
    const view = content.cmTile?.view || content.cmView?.view || null;
    return view && view.state && typeof view.dispatch === 'function' ? view : null;
}

/** CodeMirror 6：只渲染视野内的行，所以用 CSS Highlight API 给视野内的匹配上色，当前这一处用编辑器自己的选区。 */
class CodeMirrorAdapter {
    constructor(editorEl, view) {
        this.kind = 'codemirror';
        this.host = editorEl;
        this.view = view;
        this.content = view.contentDOM || editorEl.querySelector('.cm-content');
        this.scroller = view.scrollDOM || editorEl.querySelector('.cm-scroller');
        this.ranges = [];
        this.matches = [];
        this.current = -1;
    }

    init(owner) {
        this.owner = owner;
        this.refreshSoon = rafThrottle(() => this.paint());
        this.onScroll = () => this.refreshSoon();
        this.scroller?.addEventListener('scroll', this.onScroll, { passive: true });
        this.mo = new MutationObserver(() => {
            // 编辑器重绘了：内容变了就重搜；只是滚动换了可见区域就只重画高亮
            if (this.owner.query && this.view.state.doc !== this.owner.lastToken) owner.onTextInputSoon();
            this.refreshSoon();
        });
        this.mo.observe(this.content, { childList: true, subtree: true, characterData: true });
    }

    focusTarget() { return this.content; }
    getText() { return this.view.state.doc.toString(); }
    textToken() { return this.view.state.doc; }
    caret() { return this.view.state.selection.main.from; }
    isHidden() { return isSelfHidden(this.host); }
    isVisible() { return !!(this.host.offsetWidth || this.host.offsetHeight); }

    select(from, to, { focus = false } = {}) {
        const view = this.view;
        // 用 scrollIntoView:true（最近对齐）让 CodeMirror 先把这一行渲染出来；
        // EditorView.scrollIntoView 的 effect 在某些版本里往上滚不动，所以居中自己来。
        try { view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true }); } catch { /* 忽略 */ }
        if (focus) view.focus();
        this.centerSoon(from);
    }

    /** 等 CodeMirror 量完、滚完之后，再把 pos 所在行挪到编辑器中间。 */
    centerSoon(pos) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const sc = this.scroller;
            if (!sc || !this.host.isConnected) return;
            try {
                const c = this.view.coordsAtPos(pos);
                if (c && sc.scrollHeight > sc.clientHeight + 1) {
                    const r = sc.getBoundingClientRect();
                    const delta = (c.top + c.bottom) / 2 - (r.top + r.bottom) / 2;
                    if (Math.abs(delta) > 4) sc.scrollTop += delta;
                }
            } catch { /* 忽略 */ }
            this.refreshSoon();
        }));
    }

    matchRect() {
        const m = this.matches[this.current];
        const c = m && this.view.coordsAtPos(m[0]);
        if (c) return new DOMRect(c.left, c.top, Math.max(1, c.right - c.left), Math.max(1, c.bottom - c.top));
        return this.host.getBoundingClientRect();
    }

    scrollToEdge(edge) {
        const pos = edge === 'top' ? 0 : this.view.state.doc.length;
        this.select(pos, pos, { focus: true });
    }

    renderHighlights(matches, current) {
        this.matches = matches;
        this.current = current;
        this.paint();
    }

    setCurrent(prev, next) {
        this.current = next;
        this.paint();
    }

    clearHighlights() {
        this.matches = [];
        this.current = -1;
        this.paint();
    }

    /** 把视野内的匹配做成 Range 塞进全局 Highlight。 */
    paint() {
        if (!HL) return;
        for (const r of this.ranges) {
            HL.all.delete(r);
            HL.cur.delete(r);
        }
        this.ranges = [];
        if (!this.matches.length || !this.isVisible()) return;
        const view = this.view;
        const visible = view.visibleRanges?.length ? view.visibleRanges : [view.viewport];
        for (const { from, to } of visible) {
            let i = lowerBound(this.matches, from);
            for (; i < this.matches.length && this.matches[i][0] < to; i++) {
                const [s, e] = this.matches[i];
                try {
                    const a = view.domAtPos(s);
                    const b = view.domAtPos(Math.min(e, to));
                    const range = new Range();
                    range.setStart(a.node, a.offset);
                    range.setEnd(b.node, b.offset);
                    if (range.collapsed) continue;
                    (i === this.current ? HL.cur : HL.all).add(range);
                    this.ranges.push(range);
                } catch { /* 这一处不在已渲染的 DOM 里，跳过 */ }
            }
        }
    }

    syncGeometry() { /* 不需要：高亮直接画在编辑器的文字上 */ }

    destroy() {
        this.mo?.disconnect();
        this.scroller?.removeEventListener('scroll', this.onScroll);
        this.matches = [];
        this.paint();
    }
}

// ---------------------------------------------------------------------------
// 搜索栏本体
// ---------------------------------------------------------------------------

export class CodeSearch {
    /**
     * @param {HTMLElement} host textarea 或 .cm-editor
     * @param {TextareaAdapter|CodeMirrorAdapter} adapter
     * @param {{ strings?: object, temporary?: boolean, collapsed?: boolean }} [options]
     */
    constructor(host, adapter, options = {}) {
        this.host = host;
        this.adapter = adapter;
        this.t = { ...DEFAULT_STRINGS, ...(options.strings || {}) };
        this.temporary = !!options.temporary;
        this.query = '';
        this.caseSensitive = false;
        this.useRegex = false;
        this.matches = [];
        this.current = -1;
        this.lastToken = null;
        this.lastText = '';
        this.error = null;
        this.truncated = false;
        this.destroyed = false;
        this.lastRect = null;

        this.runSearchSoon = debounce(() => this.runSearch(), 60);
        this.onTextInputSoon = debounce(() => this.onTextChanged(), 120);

        const fills = this.hostFillsParent(); // 要在插入搜索栏之前量，插入后高度就变了
        this.buildToolbar();
        this.buildFab();
        this.adapter.init(this);
        this.bind();
        this.host.classList.add('stcs-host');
        if (fills) this.fitFillingHost();
        this.setCollapsed(!!options.collapsed);
    }

    buildToolbar() {
        const t = this.t;
        const bar = document.createElement('div');
        bar.className = 'stcs-toolbar';
        bar.innerHTML = `
            <div class="stcs-search-wrap">
                <i class="fa-solid fa-magnifying-glass stcs-icon"></i>
                <input type="search" class="text_pole stcs-input" spellcheck="false" autocomplete="off" autocapitalize="off" enterkeyhint="search">
                <span class="stcs-count"></span>
            </div>
            <div class="stcs-btn menu_button interactable stcs-toggle stcs-mono" data-toggle="case">Aa</div>
            <div class="stcs-btn menu_button interactable stcs-toggle stcs-mono" data-toggle="regex">.*</div>
            <div class="stcs-btn menu_button interactable" data-act="prev"><i class="fa-solid fa-chevron-up"></i></div>
            <div class="stcs-btn menu_button interactable" data-act="next"><i class="fa-solid fa-chevron-down"></i></div>
            <div class="stcs-btn menu_button interactable" data-act="goto"><i class="fa-solid fa-i-cursor"></i></div>
            <div class="stcs-sep"></div>
            <div class="stcs-btn menu_button interactable" data-act="top"><i class="fa-solid fa-angles-up"></i></div>
            <div class="stcs-btn menu_button interactable" data-act="bottom"><i class="fa-solid fa-angles-down"></i></div>
            <div class="stcs-btn menu_button interactable stcs-close" data-act="close"><i class="fa-solid fa-xmark"></i></div>
        `;
        this.toolbar = bar;
        this.input = bar.querySelector('.stcs-input');
        this.countEl = bar.querySelector('.stcs-count');
        this.input.placeholder = t.placeholder;
        bar.querySelector('[data-toggle="case"]').title = t.caseTitle;
        bar.querySelector('[data-toggle="regex"]').title = t.regexTitle;
        bar.querySelector('[data-act="prev"]').title = t.prevTitle;
        bar.querySelector('[data-act="next"]').title = t.nextTitle;
        bar.querySelector('[data-act="goto"]').title = t.gotoTitle;
        bar.querySelector('[data-act="top"]').title = t.topTitle;
        bar.querySelector('[data-act="bottom"]').title = t.bottomTitle;
        bar.querySelector('[data-act="close"]').title = t.closeTitle;
        this.host.before(bar);
    }

    /** 收起状态下显示的小图标，浮在编辑器右上角。 */
    buildFab() {
        const fab = document.createElement('div');
        fab.className = 'stcs-fab';
        fab.title = this.t.openTitle;
        fab.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
        fab.hidden = true;
        this.fab = fab;
        this.host.after(fab);
    }

    /**
     * 如果编辑器原本是撑满父容器的（酒馆的放大编辑器、柏宝箱放大后的 CodeMirror），
     * 加了搜索栏就会多出一截被裁掉；改成父容器纵向 flex、编辑器填满剩余空间。
     */
    hostFillsParent() {
        const parent = this.host.parentElement;
        if (!parent) return false;
        const ph = parent.clientHeight;
        if (!(ph > 0) || this.host.offsetHeight < ph - 2) return false;
        // 父容器的高度是它自己定的，还是被编辑器撑出来的？把编辑器藏一瞬间量一下。
        const style = this.host.style;
        const prev = style.getPropertyValue('display');
        const prevPriority = style.getPropertyPriority('display');
        style.setProperty('display', 'none', 'important');
        const without = parent.clientHeight;
        if (prev) style.setProperty('display', prev, prevPriority); else style.removeProperty('display');
        return without >= ph - 2;
    }

    fitFillingHost() {
        const parent = this.host.parentElement;
        parent.classList.add('stcs-col');
        this.host.classList.add('stcs-fill');
        this.fillParent = parent;
    }

    bind() {
        this.input.addEventListener('input', () => {
            this.query = this.input.value;
            this.runSearchSoon();
        });
        this.input.addEventListener('keydown', (e) => this.onInputKeydown(e));
        this.toolbar.addEventListener('click', (e) => this.onToolbarClick(e));
        this.toolbar.addEventListener('mousedown', (e) => {
            // 点按钮时不要把焦点从编辑器/搜索框上抢走（手机上尤其重要）
            if (e.target.closest('.stcs-btn')) e.preventDefault();
        });
        this.fab.addEventListener('click', (e) => {
            e.preventDefault();
            this.expand();
        });
        this.onHostKeydown = (e) => this.onEditorKeydown(e);
        this.adapter.focusTarget().addEventListener('keydown', this.onHostKeydown);
    }

    // ---- 展开 / 收起 ----

    setCollapsed(collapsed) {
        this.collapsed = collapsed;
        this.toolbar.hidden = collapsed;
        this.fab.hidden = !collapsed;
        if (collapsed) {
            this.adapter.clearHighlights();
            this.syncGeometry();
        } else if (this.query) {
            this.runSearch();
        }
    }

    expand() {
        if (this.collapsed) this.setCollapsed(false);
        this.focusSearch();
    }

    collapse() {
        if (this.temporary) {
            this.close();
            return;
        }
        this.setCollapsed(true);
        this.adapter.focusTarget().focus({ preventScroll: true });
    }

    // ---- 事件 ----

    onToolbarClick(e) {
        const btn = e.target.closest('[data-act], [data-toggle]');
        if (!btn) return;
        e.preventDefault();
        if (btn.dataset.toggle) {
            if (btn.dataset.toggle === 'case') this.caseSensitive = !this.caseSensitive;
            if (btn.dataset.toggle === 'regex') this.useRegex = !this.useRegex;
            btn.classList.toggle('stcs-on', btn.dataset.toggle === 'case' ? this.caseSensitive : this.useRegex);
            this.runSearch();
            this.input.focus();
            return;
        }
        switch (btn.dataset.act) {
            case 'prev': this.step(-1); break;
            case 'next': this.step(1); break;
            case 'goto': this.jumpIntoEditor(); break;
            case 'top': this.scrollToEdge('top'); break;
            case 'bottom': this.scrollToEdge('bottom'); break;
            case 'close': this.collapse(); break;
        }
    }

    onInputKeydown(e) {
        // 中文/日文输入法正在拼字时，Enter 是在选字，不能抢
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') {
            e.preventDefault();
            this.step(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.jumpIntoEditor();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            e.stopPropagation();
            this.input.select();
        } else if (e.key === 'F3' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g')) {
            e.preventDefault();
            e.stopPropagation();
            this.step(e.shiftKey ? -1 : 1);
        }
    }

    onEditorKeydown(e) {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'F3' || ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'g')) {
            if (!this.query || this.collapsed) return;
            e.preventDefault();
            e.stopPropagation();
            this.step(e.shiftKey ? -1 : 1);
        }
    }

    /** 聚焦搜索框；如果搜索框是空的，把编辑器里当前选中的文字填进去。 */
    focusSearch() {
        if (this.collapsed) this.setCollapsed(false);
        if (!this.input.value) {
            const selected = this.currentSelectionText();
            if (selected && selected.length <= 200 && !selected.includes('\n')) {
                this.input.value = selected;
                this.query = selected;
                this.runSearch();
            }
        }
        this.input.focus();
        this.input.select();
    }

    currentSelectionText() {
        if (this.adapter.kind === 'textarea') {
            const ta = this.adapter.el;
            return ta.selectionStart !== ta.selectionEnd ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : '';
        }
        const sel = this.adapter.view.state.selection.main;
        return sel.empty ? '' : this.adapter.view.state.sliceDoc(sel.from, sel.to);
    }

    onTextChanged() {
        if (this.destroyed) return;
        this.syncGeometry();
        if (this.query && !this.collapsed) this.runSearch({ jump: false });
    }

    // ---- 搜索 ----

    computeMatches(text) {
        this.error = null;
        this.truncated = false;
        if (!this.query) return [];
        let re;
        const flags = 'gmu' + (this.caseSensitive ? '' : 'i');
        try {
            re = this.useRegex ? new RegExp(this.query, flags) : new RegExp(escapeRegExp(this.query), flags);
        } catch {
            try {
                // 有些写法在 u 模式下不合法，退回不带 u 再试一次
                re = this.useRegex ? new RegExp(this.query, flags.replace('u', '')) : null;
            } catch { re = null; }
            if (!re) {
                this.error = this.t.badRegex;
                return [];
            }
        }
        const out = [];
        let m;
        while ((m = re.exec(text)) !== null) {
            if (m[0].length === 0) {
                re.lastIndex++;
                continue;
            }
            out.push([m.index, m.index + m[0].length]);
            if (out.length >= MAX_MATCHES) {
                this.truncated = true;
                break;
            }
        }
        return out;
    }

    /**
     * 重新搜索。jump=false 时（正在编辑、内容变了）只更新匹配和高亮，不动光标、不滚动，
     * 不然打字打到一半会被拽回上一处匹配。
     */
    runSearch({ focus = false, jump = true } = {}) {
        if (this.destroyed) return;
        this.runSearchSoon.cancel();
        const text = this.adapter.getText();
        const previous = this.current >= 0 && this.matches[this.current] ? this.matches[this.current][0] : null;
        this.lastToken = this.adapter.textToken();
        this.lastText = text;
        this.matches = this.computeMatches(text);

        if (!this.matches.length) {
            this.current = -1;
            this.adapter.clearHighlights();
            this.updateCount();
            return;
        }
        // 优先保持原来停留的那一处，否则从光标位置往后找第一个。
        let index = previous === null ? -1 : this.matches.findIndex(([s]) => s === previous);
        if (index < 0) {
            index = lowerBound(this.matches, this.adapter.caret());
            if (index >= this.matches.length) index = 0;
        }
        this.current = index;
        this.adapter.renderHighlights(this.matches, index);
        if (jump) this.goTo(index, { focus });
        else this.updateCount();
    }

    goTo(index, { focus = false } = {}) {
        if (!this.matches.length) return;
        const n = this.matches.length;
        index = ((index % n) + n) % n;
        const prev = this.current;
        this.current = index;
        if (prev !== index) this.adapter.setCurrent(prev, index);
        const [s, e] = this.matches[index];
        this.adapter.select(s, e, { focus });
        this.updateCount();
        // 编辑器自己滚好以后，再把编辑器所在的抽屉/弹窗/页面滚到能看见这一处
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (this.destroyed) return;
            revealRect(this.host.parentElement, () => this.adapter.matchRect());
        }));
    }

    step(delta) {
        if (!this.matches.length) {
            if (this.query) this.runSearch();
            return;
        }
        this.goTo(this.current + delta);
    }

    /** 光标跳到当前匹配处，焦点回到编辑器，可以直接改。 */
    jumpIntoEditor() {
        if (this.current >= 0 && this.matches[this.current]) {
            const [s, e] = this.matches[this.current];
            this.adapter.select(s, e, { focus: true });
        } else {
            this.adapter.focusTarget().focus({ preventScroll: true });
        }
    }

    scrollToEdge(edge) {
        this.adapter.scrollToEdge(edge);
        requestAnimationFrame(() => {
            if (this.destroyed) return;
            if (edge === 'top') {
                revealRect(this.host.parentElement, () => this.toolbar.getBoundingClientRect());
            } else {
                revealRect(this.host.parentElement, () => {
                    const r = this.host.getBoundingClientRect();
                    return new DOMRect(r.left, r.bottom - 1, r.width, 1);
                });
            }
        });
    }

    updateCount() {
        const el = this.countEl;
        el.classList.remove('stcs-error');
        if (this.error) {
            el.textContent = this.error;
            el.classList.add('stcs-error');
            return;
        }
        if (!this.query) {
            el.textContent = '';
            return;
        }
        if (!this.matches.length) {
            el.textContent = this.t.noResult;
            return;
        }
        const total = this.matches.length + (this.truncated ? this.t.tooMany : '');
        const line = lineOf(this.lastText, this.matches[this.current][0]);
        el.textContent = `${this.current + 1}/${total} · ${this.t.line(line)}`;
    }

    // ---- 几何 ----

    syncGeometry() {
        if (this.destroyed) return;
        const visible = this.adapter.isVisible();
        if (this.collapsed) {
            if (!visible) {
                this.fab.style.display = 'none';
            } else {
                this.fab.style.display = '';
                const r = this.host.getBoundingClientRect();
                const size = this.fab.offsetWidth || 22;
                // 右上角，避开竖向滚动条
                placeAbsolute(this.fab, new DOMRect(r.right - size - 14, r.top + 4, size, size));
            }
        }
        this.adapter.syncGeometry();
    }

    /** 全局定时器调用：内容变了就重搜，位置变了就重新对齐，编辑器被别的扩展藏起来了就拆掉。 */
    tick() {
        if (this.destroyed) return;
        if (!this.host.isConnected || this.adapter.isHidden()) {
            this.destroy();
            return;
        }
        if (this.adapter.kind === 'codemirror' && !getCodeMirrorView(this.host)) {
            this.destroy();
            return;
        }
        if (!this.adapter.isVisible()) return;
        if (this.query && !this.collapsed && this.adapter.textToken() !== this.lastToken) {
            this.runSearch({ jump: false });
        }
        const r = this.host.getBoundingClientRect();
        const last = this.lastRect;
        if (!last || last.top !== r.top || last.left !== r.left || last.width !== r.width || last.height !== r.height) {
            this.lastRect = r;
            this.syncGeometry();
        }
    }

    close() {
        CLOSED_BY_USER.add(this.host);
        const target = this.adapter.focusTarget();
        this.destroy();
        target.focus({ preventScroll: true });
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.runSearchSoon.cancel();
        this.onTextInputSoon.cancel();
        this.adapter.focusTarget().removeEventListener('keydown', this.onHostKeydown);
        this.adapter.destroy();
        this.host.classList.remove('stcs-host', 'stcs-fill');
        this.fillParent?.classList.remove('stcs-col');
        this.toolbar.remove();
        this.fab.remove();
        INSTANCES.delete(this.host);
    }
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------

/** 找到 el 对应的搜索目标：textarea 本身，或者它所在的 .cm-editor。 */
export function resolveHost(el) {
    if (!(el instanceof Element)) return null;
    if (el instanceof HTMLTextAreaElement) return el;
    const cm = el.closest('.cm-editor');
    return cm || null;
}

export function getInstance(el) {
    const host = resolveHost(el);
    return (host && INSTANCES.get(host)) || null;
}

/**
 * @param {HTMLElement} el textarea、.cm-editor 或其内部元素
 * @param {{ strings?: object, temporary?: boolean, collapsed?: boolean, force?: boolean }} [options]
 */
export function attach(el, options = {}) {
    const host = resolveHost(el);
    if (!host || !host.isConnected) return null;
    const existing = INSTANCES.get(host);
    if (existing) return existing;
    if (!options.force && CLOSED_BY_USER.has(host)) return null;
    if (options.force) CLOSED_BY_USER.delete(host);

    let adapter;
    if (host instanceof HTMLTextAreaElement) {
        if (isSelfHidden(host)) return null;
        adapter = new TextareaAdapter(host);
    } else {
        const view = getCodeMirrorView(host);
        if (!view) return null;
        adapter = new CodeMirrorAdapter(host, view);
    }
    const inst = new CodeSearch(host, adapter, options);
    INSTANCES.set(host, inst);
    ensureTicker();
    return inst;
}

export function detach(el) {
    getInstance(el)?.destroy();
}

export function detachAll({ keepTemporary = false } = {}) {
    for (const inst of [...INSTANCES.values()]) {
        if (keepTemporary && inst.temporary) continue;
        inst.destroy();
    }
}

/** 清理已经从页面上移除、或者被藏起来的编辑器对应的实例。 */
export function sweep() {
    for (const inst of [...INSTANCES.values()]) {
        if (!inst.host.isConnected || inst.adapter.isHidden()) inst.destroy();
    }
}

let ticker = null;
function ensureTicker() {
    if (ticker) return;
    ticker = setInterval(() => {
        if (!INSTANCES.size) return;
        for (const inst of [...INSTANCES.values()]) inst.tick();
    }, 500);
    const onAnyScroll = rafThrottle(() => {
        for (const inst of INSTANCES.values()) {
            if (!inst.collapsed || inst.fab.hidden) continue;
            inst.syncGeometry();
        }
    });
    document.addEventListener('scroll', onAnyScroll, { capture: true, passive: true });
}

/**
 * 监视页面：新出现的 textarea / CodeMirror 编辑器如果符合 classify，就自动加搜索栏；消失的自动清理。
 * @param {(host: HTMLElement) => ({ collapsed?: boolean } | null | false)} classify 返回 null/false 表示不加
 * @param {() => object} getOptions
 */
export function installWatcher(classify, getOptions) {
    let scheduled = false;
    const scan = () => {
        scheduled = false;
        sweep();
        const hosts = document.querySelectorAll('textarea, .cm-editor');
        for (const host of hosts) {
            if (INSTANCES.has(host)) continue;
            const verdict = classify(host);
            if (!verdict) continue;
            attach(host, { ...getOptions(), ...verdict });
        }
    };
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(scan);
    };
    const interesting = (node) => node instanceof HTMLElement
        && (node.tagName === 'TEXTAREA' || node.classList.contains('cm-editor') || node.querySelector('textarea, .cm-editor') !== null);
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            // 自己加的东西不算
            if (record.target instanceof Element && record.target.closest('.stcs-toolbar, .stcs-overlay')) continue;
            for (const node of record.addedNodes) {
                if (interesting(node)) { schedule(); return; }
            }
            if (INSTANCES.size) {
                for (const node of record.removedNodes) {
                    if (interesting(node)) { schedule(); return; }
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
    return { rescan: scan, stop: () => observer.disconnect() };
}

/**
 * 全局快捷键：
 * - 在带搜索栏的编辑器里按 Ctrl/Cmd+F：展开并聚焦搜索框
 * - 在其它 textarea / CodeMirror 里按 Ctrl/Cmd+F（可选）：临时加一条搜索栏
 */
export function installHotkeys({ allowAnyEditor, getOptions }) {
    const handler = (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'f') return;
        const host = resolveHost(e.target);
        if (!host) return;
        let inst = INSTANCES.get(host);
        if (!inst && allowAnyEditor()) {
            inst = attach(host, { ...getOptions(), temporary: true, force: true });
        }
        if (!inst) return;
        e.preventDefault();
        e.stopPropagation();
        inst.focusSearch();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
}
