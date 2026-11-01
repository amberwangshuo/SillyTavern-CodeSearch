// 代码搜索 / Code Search — 核心逻辑
// 给任意 textarea 加一条搜索栏：搜索、高亮、上一个/下一个、回顶、到底。
// 这个文件不依赖酒馆本体，方便单独测试；酒馆相关的接入在 index.js。

const MAX_MATCHES = 5000;
const INSTANCES = new Map();          // textarea -> CodeSearch
const CLOSED_BY_USER = new WeakSet(); // 用户手动关掉的 textarea，不再自动附加

const DEFAULT_STRINGS = {
    placeholder: '搜索代码…',
    caseTitle: '区分大小写',
    regexTitle: '正则表达式',
    prevTitle: '上一个 (Shift+Enter)',
    nextTitle: '下一个 (Enter)',
    topTitle: '回到顶部',
    bottomTitle: '跳到底部',
    closeTitle: '关闭搜索栏',
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

/** 搜索栏放在哪：一般放在 textarea 前面；如果 textarea 的父元素是横向 flex（比如酒馆自定义 CSS 那一行），就放在父元素前面。 */
function findToolbarAnchor(ta) {
    const parent = ta.parentElement;
    if (!parent || parent === document.body) return ta;
    const cs = getComputedStyle(parent);
    if (cs.display.includes('flex') && !cs.flexDirection.startsWith('column') && parent.parentElement) {
        return parent;
    }
    return ta;
}

function lineOf(text, index) {
    let line = 1;
    for (let i = 0; i < index; i++) {
        if (text.charCodeAt(i) === 10) line++;
    }
    return line;
}

export class CodeSearch {
    /**
     * @param {HTMLTextAreaElement} ta
     * @param {{ strings?: object, temporary?: boolean }} [options]
     */
    constructor(ta, options = {}) {
        this.ta = ta;
        this.t = { ...DEFAULT_STRINGS, ...(options.strings || {}) };
        this.temporary = !!options.temporary;
        this.query = '';
        this.caseSensitive = false;
        this.useRegex = false;
        this.matches = [];
        this.marks = [];
        this.current = -1;
        this.lastText = null;
        this.error = null;
        this.destroyed = false;

        this.runSearchSoon = debounce(() => this.runSearch(), 60);
        this.onTextInputSoon = debounce(() => this.onTextChanged(), 120);

        this.buildToolbar();
        this.buildOverlay();
        this.bind();
        this.ta.classList.add('stcs-host');
    }

    buildToolbar() {
        const t = this.t;
        const bar = document.createElement('div');
        bar.className = 'stcs-toolbar';
        bar.innerHTML = `
            <div class="stcs-search-wrap">
                <i class="fa-solid fa-magnifying-glass stcs-icon"></i>
                <input type="text" class="text_pole stcs-input" spellcheck="false" autocomplete="off">
                <span class="stcs-count"></span>
            </div>
            <div class="stcs-btn menu_button interactable stcs-toggle stcs-mono" data-toggle="case">Aa</div>
            <div class="stcs-btn menu_button interactable stcs-toggle stcs-mono" data-toggle="regex">.*</div>
            <div class="stcs-btn menu_button interactable" data-act="prev"><i class="fa-solid fa-chevron-up"></i></div>
            <div class="stcs-btn menu_button interactable" data-act="next"><i class="fa-solid fa-chevron-down"></i></div>
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
        bar.querySelector('[data-act="top"]').title = t.topTitle;
        bar.querySelector('[data-act="bottom"]').title = t.bottomTitle;
        bar.querySelector('[data-act="close"]').title = t.closeTitle;

        const anchor = findToolbarAnchor(this.ta);
        anchor.parentElement.insertBefore(bar, anchor);
    }

    buildOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'stcs-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.hidden = true;
        this.overlay = overlay;
        const parent = this.ta.parentElement;
        this.parentPositionChanged = false;
        if (getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
            this.parentPositionChanged = true;
        }
        this.ta.after(overlay);
    }

    bind() {
        const ta = this.ta;
        this.input.addEventListener('input', () => {
            this.query = this.input.value;
            this.runSearchSoon();
        });
        this.input.addEventListener('keydown', (e) => this.onInputKeydown(e));
        this.toolbar.addEventListener('click', (e) => this.onToolbarClick(e));

        this.onTaScroll = () => this.syncScroll();
        this.onTaInput = () => this.onTextInputSoon();
        this.onTaKeydown = (e) => this.onTextareaKeydown(e);
        ta.addEventListener('scroll', this.onTaScroll, { passive: true });
        ta.addEventListener('input', this.onTaInput);
        ta.addEventListener('keydown', this.onTaKeydown);

        if (typeof ResizeObserver === 'function') {
            this.resizeObserver = new ResizeObserver(() => this.syncGeometry());
            this.resizeObserver.observe(ta);
        }
        // 有些修改不会触发 input 事件（比如酒馆助手放大编辑器确认后回写），定时核对一次。
        this.pollTimer = setInterval(() => {
            if (this.query && this.ta.value !== this.lastText) this.runSearch();
        }, 1000);
    }

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
            case 'prev': this.step(-1); this.input.focus(); break;
            case 'next': this.step(1); this.input.focus(); break;
            case 'top': this.scrollToEdge('top'); break;
            case 'bottom': this.scrollToEdge('bottom'); break;
            case 'close': this.close(); break;
        }
    }

    onInputKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.step(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.jumpIntoTextarea();
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

    onTextareaKeydown(e) {
        if (e.key === 'F3' || ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'g')) {
            if (!this.query) return;
            e.preventDefault();
            e.stopPropagation();
            this.step(e.shiftKey ? -1 : 1);
        }
    }

    /** 聚焦搜索框；如果搜索框是空的，把 textarea 里当前选中的文字填进去。 */
    focusSearch() {
        const ta = this.ta;
        if (!this.input.value && ta.selectionStart !== ta.selectionEnd) {
            const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
            if (selected.length <= 200 && !selected.includes('\n')) {
                this.input.value = selected;
                this.query = selected;
                this.runSearch();
            }
        }
        this.input.focus();
        this.input.select();
    }

    onTextChanged() {
        this.syncGeometry();
        if (this.query) this.runSearch();
    }

    computeMatches(text) {
        this.error = null;
        if (!this.query) return [];
        let re;
        const flags = 'gm' + (this.caseSensitive ? '' : 'i');
        try {
            re = this.useRegex ? new RegExp(this.query, flags) : new RegExp(escapeRegExp(this.query), flags);
        } catch (err) {
            this.error = this.t.badRegex;
            return [];
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
                return out;
            }
        }
        this.truncated = false;
        return out;
    }

    runSearch() {
        if (this.destroyed) return;
        this.runSearchSoon.cancel();
        const text = this.ta.value;
        const previous = this.current >= 0 && this.matches[this.current] ? this.matches[this.current][0] : null;
        this.lastText = text;
        this.matches = this.computeMatches(text);
        this.renderOverlay();

        if (!this.matches.length) {
            this.current = -1;
            this.updateCount();
            return;
        }
        // 优先保持原来停留的那一处，否则从光标位置往后找第一个。
        let index = previous === null ? -1 : this.matches.findIndex(([s]) => s === previous);
        if (index < 0) {
            const caret = this.ta.selectionStart || 0;
            index = this.matches.findIndex(([s]) => s >= caret);
            if (index < 0) index = 0;
        }
        this.goTo(index);
    }

    renderOverlay() {
        const text = this.ta.value;
        const frag = document.createDocumentFragment();
        this.marks = [];
        let pos = 0;
        for (const [s, e] of this.matches) {
            if (s > pos) frag.append(text.slice(pos, s));
            const mark = document.createElement('span');
            mark.className = 'stcs-m';
            mark.textContent = text.slice(s, e);
            frag.append(mark);
            this.marks.push(mark);
            pos = e;
        }
        // 结尾补一个零宽字符：textarea 末尾的换行会多显示一行，div 不会，补上才能对齐。
        frag.append(text.slice(pos) + '​');
        this.overlay.replaceChildren(frag);
        this.overlay.hidden = this.matches.length === 0;
        if (this.matches.length) this.syncGeometry();
    }

    goTo(index) {
        if (!this.matches.length) return;
        const n = this.matches.length;
        index = ((index % n) + n) % n;
        if (this.marks[this.current]) this.marks[this.current].classList.remove('stcs-cur');
        this.current = index;
        const mark = this.marks[index];
        mark.classList.add('stcs-cur');

        const ta = this.ta;
        const [s, e] = this.matches[index];
        try { ta.setSelectionRange(s, e); } catch { /* 忽略 */ }
        this.syncGeometry();
        const target = mark.offsetTop - ta.clientHeight / 2 + mark.offsetHeight / 2;
        ta.scrollTop = Math.max(0, target);
        this.syncScroll();
        revealRect(ta.parentElement, () => mark.getBoundingClientRect());
        this.updateCount();
    }

    step(delta) {
        if (!this.matches.length) {
            if (this.query) this.runSearch();
            return;
        }
        this.goTo(this.current + delta);
    }

    /** Esc：回到 textarea，光标停在当前匹配处。 */
    jumpIntoTextarea() {
        const ta = this.ta;
        const keepScroll = ta.scrollTop;
        ta.focus({ preventScroll: true });
        if (this.current >= 0 && this.matches[this.current]) {
            const [s, e] = this.matches[this.current];
            try { ta.setSelectionRange(s, e); } catch { /* 忽略 */ }
        }
        ta.scrollTop = keepScroll;
        this.syncScroll();
    }

    scrollToEdge(edge) {
        const ta = this.ta;
        const pos = edge === 'top' ? 0 : ta.value.length;
        ta.focus({ preventScroll: true });
        try { ta.setSelectionRange(pos, pos); } catch { /* 忽略 */ }
        ta.scrollTop = edge === 'top' ? 0 : ta.scrollHeight;
        this.syncScroll();
        if (edge === 'top') {
            revealRect(ta.parentElement, () => this.toolbar.getBoundingClientRect());
        } else {
            revealRect(ta.parentElement, () => {
                const r = ta.getBoundingClientRect();
                return new DOMRect(r.left, r.bottom - 1, r.width, 1);
            });
        }
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
        const line = lineOf(this.lastText ?? this.ta.value, this.matches[this.current][0]);
        el.textContent = `${this.current + 1}/${total} · ${this.t.line(line)}`;
    }

    /** 让高亮层和 textarea 完全重合：位置、尺寸、字体、内边距、边框、换行方式。 */
    syncGeometry() {
        if (this.destroyed || this.overlay.hidden) return;
        const ta = this.ta;
        const o = this.overlay.style;
        if (!ta.offsetWidth && !ta.offsetHeight) {
            o.display = 'none';
            return;
        }
        o.display = '';
        const cs = getComputedStyle(ta);
        const bt = parseFloat(cs.borderTopWidth) || 0;
        const br = parseFloat(cs.borderRightWidth) || 0;
        const bb = parseFloat(cs.borderBottomWidth) || 0;
        const bl = parseFloat(cs.borderLeftWidth) || 0;
        o.top = `${ta.offsetTop}px`;
        o.left = `${ta.offsetLeft}px`;
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
        this.overlay.scrollTop = this.ta.scrollTop;
        this.overlay.scrollLeft = this.ta.scrollLeft;
    }

    close() {
        CLOSED_BY_USER.add(this.ta);
        const ta = this.ta;
        this.destroy();
        ta.focus({ preventScroll: true });
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.runSearchSoon.cancel();
        this.onTextInputSoon.cancel();
        clearInterval(this.pollTimer);
        this.resizeObserver?.disconnect();
        const ta = this.ta;
        ta.removeEventListener('scroll', this.onTaScroll);
        ta.removeEventListener('input', this.onTaInput);
        ta.removeEventListener('keydown', this.onTaKeydown);
        ta.classList.remove('stcs-host');
        this.toolbar.remove();
        this.overlay.remove();
        if (this.parentPositionChanged && ta.parentElement) {
            ta.parentElement.style.position = '';
        }
        INSTANCES.delete(ta);
    }
}

export function getInstance(ta) {
    return INSTANCES.get(ta) || null;
}

export function attach(ta, options = {}) {
    if (!(ta instanceof HTMLTextAreaElement) || !ta.isConnected) return null;
    const existing = INSTANCES.get(ta);
    if (existing) return existing;
    if (!options.force && CLOSED_BY_USER.has(ta)) return null;
    if (options.force) CLOSED_BY_USER.delete(ta);
    const inst = new CodeSearch(ta, options);
    INSTANCES.set(ta, inst);
    return inst;
}

export function detach(ta) {
    INSTANCES.get(ta)?.destroy();
}

export function detachAll({ keepTemporary = false } = {}) {
    for (const inst of [...INSTANCES.values()]) {
        if (keepTemporary && inst.temporary) continue;
        inst.destroy();
    }
}

/** 清理已经从页面上移除的 textarea 对应的实例。 */
export function sweep() {
    for (const inst of [...INSTANCES.values()]) {
        if (!inst.ta.isConnected) inst.destroy();
    }
}

/**
 * 监视页面：新出现的 textarea 如果符合 shouldAttach，就自动加搜索栏；消失的自动清理。
 * @param {(ta: HTMLTextAreaElement) => boolean} shouldAttach
 * @param {() => object} getOptions
 */
export function installWatcher(shouldAttach, getOptions) {
    let scheduled = false;
    const scan = () => {
        scheduled = false;
        sweep();
        for (const ta of document.querySelectorAll('textarea')) {
            if (INSTANCES.has(ta) || !shouldAttach(ta)) continue;
            attach(ta, getOptions());
        }
    };
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(scan);
    };
    const hasTextarea = (node) => node instanceof HTMLElement && (node.tagName === 'TEXTAREA' || node.querySelector('textarea') !== null);
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (hasTextarea(node)) { schedule(); return; }
            }
            if (INSTANCES.size) {
                for (const node of record.removedNodes) {
                    if (hasTextarea(node)) { schedule(); return; }
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
 * - 在带搜索栏的 textarea 里按 Ctrl/Cmd+F：聚焦搜索框
 * - 在其它 textarea 里按 Ctrl/Cmd+F（可选）：临时加一条搜索栏
 */
export function installHotkeys({ allowAnyTextarea, getOptions }) {
    const handler = (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'f') return;
        const target = e.target;
        if (!(target instanceof HTMLTextAreaElement)) return;
        let inst = INSTANCES.get(target);
        if (!inst && allowAnyTextarea()) {
            inst = attach(target, { ...getOptions(), temporary: true, force: true });
        }
        if (!inst) return;
        e.preventDefault();
        e.stopPropagation();
        inst.focusSearch();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
}
