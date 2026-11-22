// 聊天速查 / Chat Peek
// 不用切换聊天，直接翻看、搜索同一个角色（或群组）其他聊天里的消息，一键复制或插入到输入框。
// 只读：不改任何聊天文件。只依赖全局的 SillyTavern.getContext()，不依赖本扩展的其他文件，
// 以后想单独拿出去做成一个扩展，把这个文件和 style.css 里 stcp- 开头的那一段带走就行。

const MODULE_NAME = 'chatPeek';

const DEFAULT_SETTINGS = {
    enabled: true,              // 总开关
    inputButton: true,          // 输入框左边放一个按钮
    closeOnInsertMobile: true,  // 手机上点「插入」后自动收起面板
    searchSwipes: true,         // 搜索时也搜没被选中的备选回复（swipe）
    side: 'right',              // 面板靠哪一边
    width: 420,                 // 面板宽度（电脑）
};

const EXCERPT_LENGTH = 320;     // 收起状态下一条消息显示多少字
const EXCERPT_SLACK = 80;       // 只比上限多这么点字就不折叠了
const MAX_HITS_PER_CHAT = 20;   // 全部聊天的搜索结果里，每个聊天先列多少条
const RENDER_BATCH = 300;       // 一次往页面上放多少条消息
const LOAD_CONCURRENCY = 3;     // 同时读几个聊天文件
const MOBILE_QUERY = '(max-width: 1000px)';

const STRINGS = {
    zh: {
        title: '聊天速查',
        open: '聊天速查：翻看、搜索这个角色的其他聊天',
        back: '返回',
        refresh: '重新读取聊天列表',
        side: '面板换到另一边',
        close: '关闭',
        resize: '拖动调整宽度',
        searchAll: (name) => `搜索「${name}」的全部聊天…`,
        searchOne: '在这个聊天里搜索…',
        clear: '清空',
        roleAll: '全部',
        roleUser: '我',
        roleChar: '角色',
        current: '当前',
        hidden: '已隐藏',
        noChar: '先打开一个角色或群组的聊天。',
        noChats: '这个角色还没有聊天记录。',
        noMessages: '这个聊天里没有消息。',
        noResults: '没有找到。',
        loading: '读取中…',
        loadingN: (i, n) => `读取中 ${i}/${n}…`,
        loadFail: '读取失败，点右上角的刷新再试一次。',
        chatFail: '这个聊天读取失败',
        nChats: (n) => `${n} 个聊天`,
        nMessages: (n) => `${n} 条消息`,
        nHits: (hits, chats) => `${hits} 条消息 · ${chats} 个聊天`,
        nOfTotal: (n, total) => `${n} / ${total} 条`,
        chatMeta: (n) => `${n} 条`,
        moreHits: (n) => `还有 ${n} 条，进这个聊天看全部`,
        enterChat: '进这个聊天看',
        copy: '复制',
        copySel: '复制选中',
        insert: '插入',
        insertSel: '插入选中',
        context: '上下文',
        contextTitle: '在原聊天里看这条消息的前后文',
        expand: (n) => `展开全文 · ${n} 字`,
        collapse: '收起',
        swipePrev: '上一个备选回复',
        swipeNext: '下一个备选回复',
        top: '回到顶部',
        bottom: '跳到底部',
        targetInput: '插入到：输入框',
        targetEdit: '插入到：正在编辑的消息',
        tip: '选中一段文字再点按钮，就只取选中的部分',
        copied: '已复制',
        copyFail: '复制失败，请长按文字手动复制',
        inserted: '已插入到输入框',
        insertedEdit: '已插入到正在编辑的消息',
        insertFail: '没找到可以插入的输入框',
        settingsTitle: '聊天速查',
        optEnabled: '启用聊天速查',
        optInputButton: '在输入框左边显示按钮（不勾的话从魔法棒菜单里打开）',
        optCloseOnInsert: '手机上点「插入」后自动收起面板',
        optSearchSwipes: '搜索时也搜没被选中的备选回复（swipe）',
        settingsDesc: '不用切换聊天，就能翻看、搜索当前角色的其他聊天记录，把里面的文字复制出来或直接插入到输入框。打开方式：输入框左边的按钮、魔法棒菜单里的「聊天速查」、或斜杠命令 /chatpeek。',
        slashHelp: '打开聊天速查面板；后面跟文字的话直接搜索，例如 /chatpeek 月光',
    },
    en: {
        title: 'Chat Peek',
        open: 'Chat Peek: browse and search this character\'s other chats',
        back: 'Back',
        refresh: 'Reload chat list',
        side: 'Move panel to the other side',
        close: 'Close',
        resize: 'Drag to resize',
        searchAll: (name) => `Search all chats with ${name}…`,
        searchOne: 'Search in this chat…',
        clear: 'Clear',
        roleAll: 'All',
        roleUser: 'Me',
        roleChar: 'Character',
        current: 'current',
        hidden: 'hidden',
        noChar: 'Open a character or group chat first.',
        noChats: 'This character has no chats yet.',
        noMessages: 'No messages in this chat.',
        noResults: 'Nothing found.',
        loading: 'Loading…',
        loadingN: (i, n) => `Loading ${i}/${n}…`,
        loadFail: 'Failed to load. Try the reload button.',
        chatFail: 'Failed to load this chat',
        nChats: (n) => `${n} chat${n === 1 ? '' : 's'}`,
        nMessages: (n) => `${n} message${n === 1 ? '' : 's'}`,
        nHits: (hits, chats) => `${hits} message${hits === 1 ? '' : 's'} · ${chats} chat${chats === 1 ? '' : 's'}`,
        nOfTotal: (n, total) => `${n} / ${total}`,
        chatMeta: (n) => `${n} msg`,
        moreHits: (n) => `${n} more — open this chat to see all`,
        enterChat: 'Open in this panel',
        copy: 'Copy',
        copySel: 'Copy selection',
        insert: 'Insert',
        insertSel: 'Insert selection',
        context: 'Context',
        contextTitle: 'Show this message in its chat',
        expand: (n) => `Show all · ${n} chars`,
        collapse: 'Collapse',
        swipePrev: 'Previous swipe',
        swipeNext: 'Next swipe',
        top: 'Jump to top',
        bottom: 'Jump to bottom',
        targetInput: 'Inserts into: message box',
        targetEdit: 'Inserts into: the message being edited',
        tip: 'Select part of a message first to copy or insert only that part',
        copied: 'Copied',
        copyFail: 'Copy failed — long-press the text to copy manually',
        inserted: 'Inserted into the message box',
        insertedEdit: 'Inserted into the message being edited',
        insertFail: 'No text box to insert into',
        settingsTitle: 'Chat Peek',
        optEnabled: 'Enable Chat Peek',
        optInputButton: 'Show a button left of the message box (otherwise open it from the wand menu)',
        optCloseOnInsert: 'On phones, close the panel after Insert',
        optSearchSwipes: 'Also search swipes that are not currently selected',
        settingsDesc: 'Browse and search the current character\'s other chats without switching to them, then copy text or insert it straight into the message box. Open it with the button left of the message box, "Chat Peek" in the wand menu, or the /chatpeek slash command.',
        slashHelp: 'Opens the Chat Peek panel; with text, searches for it right away, e.g. /chatpeek moonlight',
    },
};

function getStrings() {
    let lang = '';
    try {
        lang = localStorage.getItem('language') || navigator.language || '';
    } catch {
        lang = navigator.language || '';
    }
    return String(lang).toLowerCase().startsWith('zh') ? STRINGS.zh : STRINGS.en;
}

const getCtx = () => globalThis.SillyTavern?.getContext?.() ?? null;

function getSettings() {
    const ctx = getCtx();
    const all = ctx?.extensionSettings ?? {};
    if (!all[MODULE_NAME] || typeof all[MODULE_NAME] !== 'object') all[MODULE_NAME] = {};
    const s = all[MODULE_NAME];
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (typeof s[key] !== typeof value) s[key] = value;
    }
    if (s.side !== 'left' && s.side !== 'right') s.side = DEFAULT_SETTINGS.side;
    return s;
}

function saveSettings() {
    getCtx()?.saveSettingsDebounced?.();
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function icon(name) {
    return el('i', `fa-solid ${name}`);
}

function isMobile() {
    return window.matchMedia(MOBILE_QUERY).matches;
}

function toMoment(value) {
    try {
        const m = getCtx()?.timestampToMoment?.(value);
        return m && m.isValid() ? m : null;
    } catch {
        return null;
    }
}

function toMillis(value) {
    const m = toMoment(value);
    if (m) return m.valueOf();
    const parsed = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
    const ms = toMillis(value);
    if (!ms) return '';
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    const day = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return d.getFullYear() === new Date().getFullYear() ? day : `${d.getFullYear()}-${day}`;
}

function toast(kind, message) {
    try {
        globalThis.toastr?.[kind]?.(message, '', { timeOut: 1800 });
    } catch { /* 忽略 */ }
}

/** 同时最多跑 limit 个的任务队列。 */
function createLimiter(limit) {
    let active = 0;
    const queue = [];
    const next = () => {
        if (active >= limit || !queue.length) return;
        active++;
        const { task, resolve, reject } = queue.shift();
        Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; next(); });
    };
    return (task) => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); next(); });
}

// ---------------------------------------------------------------------------
// 搜索：空格分开的每个词都要出现在同一条消息里；引号里的内容当成一个整体
// ---------------------------------------------------------------------------

function parseQuery(raw) {
    const terms = [];
    const re = /["“]([^"”]+)["”]|(\S+)/g;
    let m;
    while ((m = re.exec(String(raw ?? '')))) {
        const term = (m[1] ?? m[2]).trim();
        if (term && !terms.includes(term)) terms.push(term);
    }
    if (!terms.length) return null;
    const sources = terms.map(escapeRegExp);
    return {
        terms,
        tests: sources.map(s => new RegExp(s, 'i')),
        // 长的词排前面，重叠时优先标出长的
        all: new RegExp([...sources].sort((a, b) => b.length - a.length).join('|'), 'gi'),
    };
}

/** 这条消息匹配的话返回匹配到的那个 swipe 的下标（优先当前选中的），否则 -1。 */
function matchMessage(msg, q, searchSwipes) {
    const hit = (text) => q.tests.every(re => re.test(text));
    if (hit(msg.texts[msg.cur])) return msg.cur;
    if (!searchSwipes) return -1;
    for (let k = 0; k < msg.texts.length; k++) {
        if (k !== msg.cur && hit(msg.texts[k])) return k;
    }
    return -1;
}

/** 收起状态下显示哪一段：有搜索词就取第一处匹配附近，否则取开头。 */
function excerptRange(text, q) {
    if (text.length <= EXCERPT_LENGTH + EXCERPT_SLACK) return [0, text.length];
    let start = 0;
    if (q) {
        q.all.lastIndex = 0;
        const m = q.all.exec(text);
        if (m && m.index > 100) start = m.index - 60;
    }
    if (start > 0) {
        // 附近有换行就从行首开始，读起来不那么突兀
        const lineStart = text.lastIndexOf('\n', start) + 1;
        if (lineStart > 0 && start - lineStart <= 80) start = lineStart;
    }
    let end = Math.min(text.length, start + EXCERPT_LENGTH);
    if (text.length - end < EXCERPT_SLACK) end = text.length;
    return [start, end];
}

/** 把 text[start,end) 写进 node，匹配处包上 <mark>。 */
function renderText(node, text, q, start, end) {
    const frag = document.createDocumentFragment();
    if (start > 0) frag.append(el('span', 'stcp-ellipsis', '…'));
    const slice = text.slice(start, end);
    let pos = 0;
    if (q) {
        q.all.lastIndex = 0;
        let m;
        while ((m = q.all.exec(slice))) {
            if (!m[0]) { q.all.lastIndex++; continue; }
            if (m.index > pos) frag.append(slice.slice(pos, m.index));
            frag.append(el('mark', 'stcp-mark', m[0]));
            pos = m.index + m[0].length;
        }
    }
    if (pos < slice.length) frag.append(slice.slice(pos));
    if (end < text.length) frag.append(el('span', 'stcp-ellipsis', '…'));
    node.replaceChildren(frag);
}

// ---------------------------------------------------------------------------
// 数据：当前是谁、它有哪些聊天、每个聊天里有什么
// ---------------------------------------------------------------------------

/** 当前打开的角色或群组；什么都没打开时返回 null。 */
function getSource() {
    const ctx = getCtx();
    if (!ctx) return null;
    if (ctx.groupId) {
        const group = ctx.groups?.find(g => g.id == ctx.groupId);
        if (!group) return null;
        return { kind: 'group', key: `group:${group.id}`, name: String(group.name ?? ''), groupId: group.id, chatIds: [...(group.chats ?? [])], currentId: group.chat_id ?? null };
    }
    const character = ctx.characters?.[ctx.characterId];
    if (!character?.avatar) return null;
    return { kind: 'char', key: `char:${character.avatar}`, name: String(character.name ?? ''), avatar: character.avatar, currentId: character.chat ?? null };
}

async function post(url, body) {
    const ctx = getCtx();
    const response = await fetch(url, {
        method: 'POST',
        headers: ctx.getRequestHeaders(),
        body: JSON.stringify(body),
        cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`${url} → ${response.status}`);
    return response.json();
}

function toChatEntry(info, source) {
    const id = String(info.file_id ?? String(info.file_name ?? '').replace(/\.jsonl$/i, ''));
    return {
        id,
        count: Number(info.chat_items ?? info.message_count ?? -1),
        last: info.last_mes,
        lastMs: toMillis(info.last_mes),
        size: String(info.file_size ?? ''),
        preview: String(info.mes ?? info.preview_message ?? '').slice(0, 160),
        // 文件有没有变过就看这三样
        stamp: `${info.file_size}|${info.last_mes}|${info.chat_items}`,
        current: id === source.currentId,
    };
}

/** 列出这个角色/群组的全部聊天，最近聊过的排前面。 */
async function listChats(source) {
    let infos = [];
    if (source.kind === 'group') {
        const results = await Promise.allSettled(source.chatIds.map(id => post('/api/chats/group/info', { id })));
        // 读不到信息的（比如老版本酒馆没有这个接口）也列出来，只是没有条数和时间
        infos = results.map((r, n) => (r.status === 'fulfilled' && r.value?.file_name ? r.value : { file_id: source.chatIds[n] }));
    } else {
        const data = await post('/api/characters/chats', { avatar_url: source.avatar });
        if (data && typeof data === 'object' && data.error !== true) infos = Object.values(data);
    }
    return infos
        .filter(info => info && (info.file_id || info.file_name))
        .map(info => toChatEntry(info, source))
        .sort((a, b) => (b.lastMs - a.lastMs) || b.id.localeCompare(a.id));
}

/**
 * 把酒馆的消息数组瘦身成只留要用的字段（聊天文件里还有一大堆 extra，全留着太占内存）。
 * i 是消息在聊天里的序号，和酒馆界面上的 #序号 一致。
 */
function slimMessages(list, hasHeader) {
    let messages = Array.isArray(list) ? list : [];
    if (hasHeader && messages.length && (messages[0]?.chat_metadata !== undefined || typeof messages[0]?.mes !== 'string')) {
        messages = messages.slice(1);
    }
    const out = [];
    messages.forEach((m, i) => {
        if (!m || typeof m.mes !== 'string') return;
        let texts = [m.mes];
        let cur = 0;
        if (Array.isArray(m.swipes) && m.swipes.length > 1) {
            texts = m.swipes.map(s => (typeof s === 'string' ? s : ''));
            cur = Number.isInteger(m.swipe_id) && m.swipe_id >= 0 && m.swipe_id < texts.length ? m.swipe_id : 0;
            texts[cur] = m.mes; // 当前显示的以 mes 为准
        }
        if (!texts.some(text => text.trim())) return;
        out.push({ i, name: String(m.name ?? ''), user: !!m.is_user, sys: !!m.is_system, date: m.send_date, texts, cur });
    });
    return out;
}

const cache = new Map(); // 聊天 id -> { stamp, promise }
const limit = createLimiter(LOAD_CONCURRENCY);

/** 读一个聊天的全部消息。当前聊天直接用内存里的（包含还没存盘的修改），其他聊天读文件并缓存。 */
function getMessages(source, chat) {
    if (chat.current) {
        // 当前聊天随时在变，不缓存；等它不再是当前聊天时会重新从文件读
        cache.delete(chat.id);
        return Promise.resolve(slimMessages(getCtx()?.chat, false));
    }
    const cached = cache.get(chat.id);
    if (cached && cached.stamp === chat.stamp) return cached.promise;
    const promise = limit(async () => {
        const data = source.kind === 'group'
            ? await post('/api/chats/group/get', { id: chat.id })
            : await post('/api/chats/get', { ch_name: source.name, file_name: chat.id, avatar_url: source.avatar });
        return slimMessages(data, true);
    });
    cache.set(chat.id, { stamp: chat.stamp, promise });
    promise.catch(() => {
        // 失败的不留在缓存里，下次再试
        if (cache.get(chat.id)?.promise === promise) cache.delete(chat.id);
    });
    return promise;
}

// ---------------------------------------------------------------------------
// 复制、插入
// ---------------------------------------------------------------------------

async function copyText(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* 走下面的老办法 */ }
    // 用局域网 IP（http）访问酒馆时没有 navigator.clipboard，只能靠 execCommand
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.className = 'stcp-copy-helper';
    (ui.panel ?? document.body).append(helper);
    let ok = false;
    try {
        helper.select();
        helper.setSelectionRange(0, text.length);
        ok = document.execCommand('copy');
    } catch {
        ok = false;
    }
    helper.remove();
    return ok;
}

function isUsable(textarea) {
    return textarea instanceof HTMLTextAreaElement && textarea.isConnected && textarea.getClientRects().length > 0
        && !textarea.readOnly && !textarea.disabled;
}

/** 插到哪：正在编辑某条消息就插到那条消息里，否则插到输入框。 */
function getInsertTarget() {
    const editing = document.querySelector('#chat .mes .edit_textarea');
    if (isUsable(editing)) return { textarea: editing, kind: 'edit' };
    const input = document.getElementById('send_textarea');
    if (input instanceof HTMLTextAreaElement && !input.readOnly && !input.disabled) return { textarea: input, kind: 'input' };
    return null;
}

/** 在光标处插入（有选区就替换选区），和粘贴的效果一样。 */
function insertText(text) {
    const target = getInsertTarget();
    if (!target) return null;
    const ta = target.textarea;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    ta.setRangeText(text, start, end, 'end');
    // 让酒馆知道内容变了：输入框自动长高、保存草稿等都靠 input 事件
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    if (!isMobile()) {
        // 手机上不抢焦点，免得键盘弹出来挡住面板
        ta.focus({ preventScroll: true });
    }
    if (ta.selectionEnd >= ta.value.length) ta.scrollTop = ta.scrollHeight;
    ta.classList.remove('stcp-flash-target');
    void ta.offsetWidth;
    ta.classList.add('stcp-flash-target');
    setTimeout(() => ta.classList.remove('stcp-flash-target'), 900);
    return target.kind;
}

// ---------------------------------------------------------------------------
// 面板
// ---------------------------------------------------------------------------

const ui = {
    panel: null, body: null, input: null, clear: null, back: null, title: null,
    roles: null, status: null, chatbar: null, chatbarName: null, target: null,
};

const state = {
    source: null,   // 当前角色/群组
    chats: [],      // 它的全部聊天
    scope: null,    // 正在看的那个聊天的 id；null 表示全部聊天
    query: '',
    role: 'all',    // all / user / char
    stack: [],      // 返回用：之前的 { scope, query, role, scrollTop }
    run: 0,         // 每次重画加一，过期的异步结果据此丢弃
    dirty: true,    // 聊天列表需要重新读
    lastError: false,
    savedScroll: 0, // 面板收起时滚到哪了
};

let refreshSeq = 0;             // 只认最后一次发起的刷新
const cardData = new WeakMap(); // 消息卡片元素 -> { msg, swipe, q, expanded, showContext, chatId }
let batch = null;               // 当前这批还没放完的卡片
const selection = { card: null, text: '', clearedAt: 0 };

function buildPanel() {
    const t = getStrings();
    const panel = el('div', 'stcp-panel');
    panel.id = 'stcp-panel';
    panel.hidden = true;
    panel.innerHTML = `
        <div class="stcp-resize" title="${escapeHtml(t.resize)}"></div>
        <div class="stcp-head">
            <button type="button" class="stcp-ibtn stcp-back" data-act="back" title="${escapeHtml(t.back)}" hidden><i class="fa-solid fa-arrow-left"></i></button>
            <div class="stcp-title"><i class="fa-solid fa-clock-rotate-left"></i><span class="stcp-title-text"></span></div>
            <button type="button" class="stcp-ibtn" data-act="refresh" title="${escapeHtml(t.refresh)}"><i class="fa-solid fa-rotate"></i></button>
            <button type="button" class="stcp-ibtn stcp-side" data-act="side" title="${escapeHtml(t.side)}"><i class="fa-solid fa-right-left"></i></button>
            <button type="button" class="stcp-ibtn" data-act="close" title="${escapeHtml(t.close)}"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="stcp-searchrow">
            <i class="fa-solid fa-magnifying-glass stcp-search-icon"></i>
            <input type="text" class="text_pole stcp-input" autocomplete="off" spellcheck="false" enterkeyhint="search">
            <button type="button" class="stcp-ibtn stcp-clear" data-act="clear" title="${escapeHtml(t.clear)}" hidden><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="stcp-chatbar" hidden>
            <span class="stcp-chatbar-name"></span>
            <button type="button" class="stcp-ibtn" data-act="top" title="${escapeHtml(t.top)}"><i class="fa-solid fa-angles-up"></i></button>
            <button type="button" class="stcp-ibtn" data-act="bottom" title="${escapeHtml(t.bottom)}"><i class="fa-solid fa-angles-down"></i></button>
        </div>
        <div class="stcp-filterrow">
            <div class="stcp-roles">
                <button type="button" class="stcp-chip" data-role="all">${escapeHtml(t.roleAll)}</button>
                <button type="button" class="stcp-chip" data-role="user">${escapeHtml(t.roleUser)}</button>
                <button type="button" class="stcp-chip" data-role="char">${escapeHtml(t.roleChar)}</button>
            </div>
            <span class="stcp-status"></span>
        </div>
        <div class="stcp-body"></div>
        <div class="stcp-foot">
            <span class="stcp-target"></span>
            <span class="stcp-tip">${escapeHtml(t.tip)}</span>
        </div>
    `;
    ui.panel = panel;
    ui.body = panel.querySelector('.stcp-body');
    ui.input = panel.querySelector('.stcp-input');
    ui.clear = panel.querySelector('.stcp-clear');
    ui.back = panel.querySelector('.stcp-back');
    ui.title = panel.querySelector('.stcp-title-text');
    ui.roles = panel.querySelector('.stcp-roles');
    ui.status = panel.querySelector('.stcp-status');
    ui.chatbar = panel.querySelector('.stcp-chatbar');
    ui.chatbarName = panel.querySelector('.stcp-chatbar-name');
    ui.target = panel.querySelector('.stcp-target');

    let searchTimer = null;
    ui.input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.query = ui.input.value;
            render();
        }, 180);
    });
    ui.input.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || e.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        if (ui.input.value) setQuery('');
        else closePanel();
    });

    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target instanceof Element && e.target.classList.contains('stcp-chat')) {
            enterChat(e.target.dataset.chat);
        }
    });
    // 点按钮时别把消息里选中的文字弄没了
    panel.addEventListener('mousedown', (e) => {
        if (e.target instanceof Element && e.target.closest('.stcp-act')) e.preventDefault();
    });
    panel.addEventListener('pointerenter', updateTargetLabel);
    installResize(panel.querySelector('.stcp-resize'));
    applyLayout();
    document.body.append(panel);
}

function applyLayout() {
    if (!ui.panel) return;
    const s = getSettings();
    ui.panel.classList.toggle('stcp-left', s.side === 'left');
    ui.panel.style.setProperty('--stcp-width', `${Math.round(s.width)}px`);
}

function installResize(handle) {
    handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        handle.setPointerCapture(e.pointerId);
        const s = getSettings();
        const startX = e.clientX;
        const startWidth = ui.panel.getBoundingClientRect().width;
        const direction = s.side === 'left' ? 1 : -1;
        const onMove = (ev) => {
            const width = Math.max(300, Math.min(window.innerWidth - 40, startWidth + (ev.clientX - startX) * direction));
            s.width = Math.round(width);
            ui.panel.style.setProperty('--stcp-width', `${s.width}px`);
        };
        const onUp = () => {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
            saveSettings();
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
    });
}

function updateTargetLabel() {
    if (!ui.target) return;
    const t = getStrings();
    const target = getInsertTarget();
    ui.target.textContent = target?.kind === 'edit' ? t.targetEdit : t.targetInput;
}

function setQuery(value) {
    state.query = value;
    ui.input.value = value;
    render();
}

function pushState() {
    state.stack.push({ scope: state.scope, query: state.query, role: state.role, scrollTop: ui.body.scrollTop });
    if (state.stack.length > 30) state.stack.shift();
}

function goBack() {
    const prev = state.stack.pop();
    if (prev && (prev.scope === null || state.chats.some(c => c.id === prev.scope))) {
        state.scope = prev.scope;
        state.query = prev.query;
        state.role = prev.role;
        ui.input.value = prev.query;
        render({ scrollTop: prev.scrollTop });
        return;
    }
    state.scope = null;
    setQuery('');
}

/** 进到某个聊天里看；focusIndex 是要定位到的消息序号。 */
function enterChat(chatId, { keepQuery = false, focusIndex = null } = {}) {
    pushState();
    state.scope = chatId;
    if (!keepQuery) {
        state.query = '';
        ui.input.value = '';
    }
    render({ focusIndex });
}

function onPanelClick(e) {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    const roleButton = target.closest('[data-role]');
    if (roleButton) {
        state.role = roleButton.dataset.role;
        render();
        return;
    }

    const actButton = target.closest('[data-act]');
    if (actButton) {
        const card = actButton.closest('.stcp-msg');
        if (card) {
            onCardAction(card, actButton);
            return;
        }
        switch (actButton.dataset.act) {
            case 'close': closePanel(); break;
            case 'back': goBack(); break;
            case 'clear': setQuery(''); ui.input.focus(); break;
            case 'refresh': refresh({ force: true }); break;
            case 'side': {
                const s = getSettings();
                s.side = s.side === 'left' ? 'right' : 'left';
                saveSettings();
                applyLayout();
                break;
            }
            case 'top': ui.body.scrollTop = 0; break;
            case 'bottom': batch?.finish(); ui.body.scrollTop = ui.body.scrollHeight; break;
            case 'enter': enterChat(actButton.dataset.chat, { keepQuery: true }); break;
        }
        return;
    }

    const chatItem = target.closest('.stcp-chat');
    if (chatItem) enterChat(chatItem.dataset.chat);
}

// ---- 选中文字：只取选中的部分 ----

function textBlockOf(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest('.stcp-text') ?? null;
}

function onSelectionChange() {
    if (!ui.panel || ui.panel.hidden) return;
    const sel = document.getSelection();
    let card = null;
    let text = '';
    if (sel && !sel.isCollapsed && sel.rangeCount) {
        const from = textBlockOf(sel.anchorNode);
        const to = textBlockOf(sel.focusNode);
        if (from && from === to && ui.panel.contains(from)) {
            card = from.closest('.stcp-msg');
            text = sel.toString();
        }
    }
    if (card && text) {
        if (selection.card !== card) selection.card?.classList.remove('stcp-has-sel');
        selection.card = card;
        selection.text = text;
        selection.clearedAt = 0;
        card.classList.add('stcp-has-sel');
    } else if (selection.card && !selection.clearedAt) {
        // 手机上点按钮的瞬间选区会先消失，留一小段时间让按钮还能拿到刚才选的字
        selection.clearedAt = Date.now();
        const card0 = selection.card;
        setTimeout(() => {
            if (selection.card === card0 && selection.clearedAt) {
                card0.classList.remove('stcp-has-sel');
                selection.card = null;
                selection.text = '';
                selection.clearedAt = 0;
            }
        }, 600);
    }
}

function takeSelection(card) {
    if (selection.card !== card || !selection.text) return '';
    if (selection.clearedAt && Date.now() - selection.clearedAt > 600) return '';
    return selection.text;
}

// ---- 消息卡片 ----

function makeCard(item, chatId, q, showContext) {
    const { msg, swipe } = item;
    const t = getStrings();
    const card = el('div', `stcp-msg ${msg.user ? 'stcp-user' : 'stcp-char'}`);
    card.dataset.i = String(msg.i);
    cardData.set(card, { msg, swipe, q, expanded: false, showContext, chatId });

    const head = el('div', 'stcp-msg-head');
    const who = el('div', 'stcp-who');
    who.append(el('span', 'stcp-name', msg.name || (msg.user ? t.roleUser : t.roleChar)));
    const date = formatDate(msg.date);
    who.append(el('span', 'stcp-meta', `#${msg.i}${date ? ` · ${date}` : ''}${msg.sys ? ` · ${t.hidden}` : ''}`));
    head.append(who);

    if (msg.texts.length > 1) {
        const swipes = el('span', 'stcp-swipes');
        const prev = el('button', 'stcp-ibtn stcp-act');
        prev.type = 'button';
        prev.dataset.act = 'swipe-prev';
        prev.title = t.swipePrev;
        prev.append(icon('fa-chevron-left'));
        const next = el('button', 'stcp-ibtn stcp-act');
        next.type = 'button';
        next.dataset.act = 'swipe-next';
        next.title = t.swipeNext;
        next.append(icon('fa-chevron-right'));
        swipes.append(prev, el('span', 'stcp-swipe-count'), next);
        head.append(swipes);
    }

    const actions = el('div', 'stcp-actions');
    const action = (act, iconName, label, labelSel, title) => {
        const button = el('button', 'stcp-btn stcp-act');
        button.type = 'button';
        button.dataset.act = act;
        if (title) button.title = title;
        button.append(icon(iconName), el('span', 'stcp-lbl', label));
        if (labelSel) button.append(el('span', 'stcp-lbl-sel', labelSel));
        return button;
    };
    if (showContext) actions.append(action('context', 'fa-arrows-up-down', t.context, null, t.contextTitle));
    actions.append(action('copy', 'fa-copy', t.copy, t.copySel));
    actions.append(action('insert', 'fa-arrow-right-to-bracket', t.insert, t.insertSel));
    head.append(actions);

    card.append(head, el('div', 'stcp-text'));
    fillCard(card);
    return card;
}

/** 按卡片当前的状态（哪个 swipe、展开没有）重画正文。 */
function fillCard(card) {
    const d = cardData.get(card);
    const t = getStrings();
    const text = d.msg.texts[d.swipe] ?? '';
    const excerpt = excerptRange(text, d.q);
    const long = excerpt[1] - excerpt[0] < text.length;
    const [from, to] = d.expanded ? [0, text.length] : excerpt;
    const block = card.querySelector('.stcp-text');
    renderText(block, text, d.q, from, to);
    block.classList.toggle('stcp-collapsed', long && !d.expanded);

    const count = card.querySelector('.stcp-swipe-count');
    if (count) {
        count.textContent = `${d.swipe + 1}/${d.msg.texts.length}`;
        count.classList.toggle('stcp-swipe-other', d.swipe !== d.msg.cur);
    }

    let more = card.querySelector('.stcp-more');
    if (long) {
        if (!more) {
            more = el('button', 'stcp-more stcp-act');
            more.type = 'button';
            more.dataset.act = 'toggle';
            card.append(more);
        }
        more.textContent = d.expanded ? t.collapse : t.expand(text.length);
    } else {
        more?.remove();
    }
}

function flashButton(button, ok) {
    const i = button.querySelector('i');
    if (!i) return;
    const original = button.dataset.icon ?? i.className;
    button.dataset.icon = original;
    i.className = ok ? 'fa-solid fa-check' : 'fa-solid fa-triangle-exclamation';
    button.classList.add(ok ? 'stcp-ok' : 'stcp-bad');
    clearTimeout(button._stcpTimer);
    button._stcpTimer = setTimeout(() => {
        i.className = original;
        button.classList.remove('stcp-ok', 'stcp-bad');
    }, 1000);
}

async function onCardAction(card, button) {
    const d = cardData.get(card);
    if (!d) return;
    const t = getStrings();
    const act = button.dataset.act;
    if (act === 'toggle') {
        d.expanded = !d.expanded;
        fillCard(card);
        if (!d.expanded) card.scrollIntoView({ block: 'nearest' });
        return;
    }
    if (act === 'swipe-prev' || act === 'swipe-next') {
        const n = d.msg.texts.length;
        d.swipe = (d.swipe + (act === 'swipe-next' ? 1 : n - 1)) % n;
        fillCard(card);
        return;
    }
    if (act === 'context') {
        enterChat(d.chatId, { focusIndex: d.msg.i });
        return;
    }
    const text = takeSelection(card) || (d.msg.texts[d.swipe] ?? '');
    if (act === 'copy') {
        const ok = await copyText(text);
        flashButton(button, ok);
        if (!ok) toast('warning', t.copyFail);
        return;
    }
    if (act === 'insert') {
        const kind = insertText(text);
        flashButton(button, !!kind);
        if (!kind) {
            toast('warning', t.insertFail);
        } else if (isMobile() && getSettings().closeOnInsertMobile) {
            closePanel();
            toast('success', kind === 'edit' ? t.insertedEdit : t.inserted);
        }
        updateTargetLabel();
    }
}

/** 分批把卡片放到页面上，长聊天不至于卡住。 */
function renderCards(container, items, chatId, q, showContext, run) {
    let next = 0;
    const step = (count) => {
        const frag = document.createDocumentFragment();
        const end = Math.min(items.length, next + count);
        for (; next < end; next++) frag.append(makeCard(items[next], chatId, q, showContext));
        container.append(frag);
    };
    const pump = () => {
        if (run !== state.run || next >= items.length) return;
        step(RENDER_BATCH);
        setTimeout(pump, 16);
    };
    step(RENDER_BATCH);
    if (next < items.length) setTimeout(pump, 16);
    return { finish: () => step(items.length) };
}

// ---- 三种画面：聊天列表 / 全部聊天的搜索结果 / 某个聊天 ----

function showMessage(text, className = 'stcp-empty') {
    ui.body.replaceChildren(el('div', className, text));
}

function roleMatches(msg) {
    if (state.role === 'user') return msg.user;
    if (state.role === 'char') return !msg.user;
    return true;
}

function updateChrome() {
    const t = getStrings();
    const chat = state.scope ? state.chats.find(c => c.id === state.scope) : null;
    const q = parseQuery(state.query);
    ui.title.textContent = state.source ? `${t.title} · ${state.source.name}` : t.title;
    ui.back.hidden = !state.scope;
    ui.clear.hidden = !state.query;
    ui.input.placeholder = chat ? t.searchOne : t.searchAll(state.source?.name ?? '');
    ui.input.disabled = !state.source;
    ui.chatbar.hidden = !chat;
    ui.chatbarName.textContent = chat ? chat.id : '';
    ui.chatbarName.title = chat ? chat.id : '';
    ui.roles.hidden = !chat && !q;
    for (const chip of ui.roles.querySelectorAll('[data-role]')) {
        chip.classList.toggle('stcp-on', chip.dataset.role === state.role);
    }
    updateTargetLabel();
}

function render(options = {}) {
    if (!ui.panel || ui.panel.hidden) return;
    const run = ++state.run;
    batch = null;
    const t = getStrings();
    updateChrome();
    ui.status.textContent = '';
    if (!state.source) {
        showMessage(t.noChar);
        return;
    }
    if (state.lastError && !state.chats.length) {
        showMessage(t.loadFail);
        return;
    }
    const q = parseQuery(state.query);
    if (state.scope) renderChat(run, q, options);
    else if (q) renderResults(run, q, options);
    else renderList(options);
}

function renderList({ scrollTop = 0 } = {}) {
    const t = getStrings();
    ui.status.textContent = t.nChats(state.chats.length);
    if (!state.chats.length) {
        showMessage(t.noChats);
        return;
    }
    const frag = document.createDocumentFragment();
    for (const chat of state.chats) {
        const item = el('div', 'stcp-chat');
        item.dataset.chat = chat.id;
        item.tabIndex = 0;
        const top = el('div', 'stcp-chat-top');
        top.append(el('span', 'stcp-chat-name', chat.id));
        if (chat.current) top.append(el('span', 'stcp-badge', t.current));
        const meta = [chat.count >= 0 ? t.chatMeta(chat.count) : '', formatDate(chat.last), chat.size].filter(Boolean).join(' · ');
        item.append(top, el('div', 'stcp-chat-meta', meta));
        if (chat.preview) item.append(el('div', 'stcp-chat-preview', chat.preview));
        frag.append(item);
    }
    ui.body.replaceChildren(frag);
    ui.body.scrollTop = scrollTop;
}

async function renderChat(run, q, { focusIndex = null, scrollTop = 0 } = {}) {
    const t = getStrings();
    const chat = state.chats.find(c => c.id === state.scope);
    if (!chat) {
        state.scope = null;
        render();
        return;
    }
    showMessage(t.loading, 'stcp-empty stcp-loading');
    let messages;
    try {
        messages = await getMessages(state.source, chat);
    } catch (error) {
        console.warn('[Chat Peek]', error);
        if (run === state.run) showMessage(t.loadFail);
        return;
    }
    if (run !== state.run) return;

    // 要定位的那条被「我 / 角色」筛掉了的话，先把筛选放开
    if (focusIndex !== null && state.role !== 'all') {
        const wanted = messages.find(m => m.i === focusIndex);
        if (wanted && !roleMatches(wanted)) {
            state.role = 'all';
            updateChrome();
        }
    }

    const searchSwipes = getSettings().searchSwipes;
    const pool = messages.filter(roleMatches);
    const items = [];
    for (const msg of pool) {
        if (!q) {
            items.push({ msg, swipe: msg.cur });
            continue;
        }
        const swipe = matchMessage(msg, q, searchSwipes);
        if (swipe >= 0) items.push({ msg, swipe });
    }
    ui.status.textContent = q ? t.nOfTotal(items.length, pool.length) : t.nMessages(items.length);
    if (!items.length) {
        showMessage(q ? t.noResults : t.noMessages);
        return;
    }
    ui.body.replaceChildren();
    batch = renderCards(ui.body, items, chat.id, q, !!q, run);

    if (focusIndex !== null) {
        batch.finish();
        const card = ui.body.querySelector(`.stcp-msg[data-i="${focusIndex}"]`);
        if (card) {
            card.scrollIntoView({ block: 'center' });
            card.classList.add('stcp-flash');
            setTimeout(() => card.classList.remove('stcp-flash'), 1600);
            return;
        }
    }
    if (scrollTop) batch.finish();
    ui.body.scrollTop = scrollTop;
}

async function renderResults(run, q, { scrollTop = 0 } = {}) {
    const t = getStrings();
    const source = state.source;
    // 当前聊天排最后：要找的多半是别的聊天里的东西
    const chats = [...state.chats.filter(c => !c.current), ...state.chats.filter(c => c.current)];
    if (!chats.length) {
        showMessage(t.noChats);
        return;
    }
    const searchSwipes = getSettings().searchSwipes;
    const pending = chats.map(chat => getMessages(source, chat).then(
        messages => ({ messages }),
        error => ({ error }),
    ));

    showMessage(t.loadingN(0, chats.length), 'stcp-empty stcp-loading');
    let first = true;
    let hits = 0;
    let hitChats = 0;
    for (let n = 0; n < chats.length; n++) {
        const result = await pending[n];
        if (run !== state.run) return;
        const chat = chats[n];
        ui.status.textContent = n + 1 < chats.length ? t.loadingN(n + 1, chats.length) : '';

        let items = [];
        if (result.error) {
            console.warn('[Chat Peek]', chat.id, result.error);
        } else {
            for (const msg of result.messages) {
                if (!roleMatches(msg)) continue;
                const swipe = matchMessage(msg, q, searchSwipes);
                if (swipe >= 0) items.push({ msg, swipe });
            }
        }
        if (!items.length && !result.error) continue;

        if (first) {
            ui.body.replaceChildren();
            first = false;
        }
        const group = el('div', 'stcp-group');
        const header = el('button', 'stcp-group-head');
        header.type = 'button';
        header.dataset.act = 'enter';
        header.dataset.chat = chat.id;
        header.title = t.enterChat;
        header.append(el('span', 'stcp-group-name', chat.id));
        if (chat.current) header.append(el('span', 'stcp-badge', t.current));
        header.append(el('span', 'stcp-group-count', result.error ? t.chatFail : String(items.length)), icon('fa-chevron-right'));
        group.append(header);
        if (items.length) {
            hits += items.length;
            hitChats++;
            const frag = document.createDocumentFragment();
            for (const item of items.slice(0, MAX_HITS_PER_CHAT)) frag.append(makeCard(item, chat.id, q, true));
            group.append(frag);
            if (items.length > MAX_HITS_PER_CHAT) {
                const more = el('button', 'stcp-more-hits', t.moreHits(items.length - MAX_HITS_PER_CHAT));
                more.type = 'button';
                more.dataset.act = 'enter';
                more.dataset.chat = chat.id;
                group.append(more);
            }
        }
        ui.body.append(group);
    }
    if (first) {
        showMessage(t.noResults);
        ui.status.textContent = '';
        return;
    }
    ui.status.textContent = t.nHits(hits, hitChats);
    if (scrollTop) ui.body.scrollTop = scrollTop;
}

// ---- 打开、关闭、刷新 ----

/**
 * 重新确认当前是谁、读它的聊天列表，然后重画。换了角色就回到列表。
 * force：连缓存的聊天内容也丢掉重读。
 * soft：正在看的那个聊天没变的话就不重画，免得把人看到一半的位置和展开状态弄没了。
 */
async function refresh({ force = false, soft = false } = {}) {
    if (!ui.panel || ui.panel.hidden) {
        state.dirty = true;
        return;
    }
    const seq = ++refreshSeq;
    const source = getSource();
    const sourceChanged = source?.key !== state.source?.key;
    if (sourceChanged) {
        cache.clear();
        state.scope = null;
        state.query = '';
        state.role = 'all';
        state.stack = [];
        state.chats = [];
        ui.input.value = '';
    } else if (force) {
        cache.clear();
    }
    state.source = source;
    state.dirty = false;
    state.lastError = false;
    if (!source) {
        render();
        return;
    }
    if (!state.chats.length) {
        state.run++;
        batch = null;
        updateChrome();
        ui.status.textContent = '';
        showMessage(getStrings().loading, 'stcp-empty stcp-loading');
    }
    const signature = (chat) => (chat ? `${chat.stamp}|${chat.current}` : '');
    const before = signature(state.chats.find(c => c.id === state.scope));
    let chats;
    try {
        chats = await listChats(source);
    } catch (error) {
        console.warn('[Chat Peek]', error);
        if (seq !== refreshSeq) return;
        state.lastError = true;
        state.chats = [];
        render();
        return;
    }
    if (seq !== refreshSeq || getSource()?.key !== source.key) return;
    state.chats = chats;
    for (const id of [...cache.keys()]) {
        if (!chats.some(c => c.id === id)) cache.delete(id);
    }
    if (state.scope && !chats.some(c => c.id === state.scope)) {
        state.scope = null;
        state.stack = [];
    }
    const scoped = chats.find(c => c.id === state.scope);
    if (soft && !force && !sourceChanged && scoped && !scoped.current && signature(scoped) === before && ui.body.querySelector('.stcp-msg')) {
        updateChrome();
        return;
    }
    render({ scrollTop: ui.body.scrollTop });
}

function openPanel({ query = null, focus = true } = {}) {
    if (!getSettings().enabled) return;
    if (!ui.panel) buildPanel();
    const wasHidden = ui.panel.hidden;
    ui.panel.hidden = false;
    applyLayout();
    if (typeof query === 'string' && query.trim()) {
        state.scope = null;
        state.query = query.trim();
        ui.input.value = state.query;
    }
    if (wasHidden) {
        // display:none 之后滚动位置可能被浏览器清掉，手动放回去
        ui.body.scrollTop = state.savedScroll;
        refresh({ soft: !state.dirty });
    } else if (state.dirty || getSource()?.key !== state.source?.key) {
        refresh();
    } else {
        render();
    }
    if (focus && !isMobile()) ui.input.focus();
}

function closePanel() {
    if (!ui.panel || ui.panel.hidden) return;
    batch?.finish(); // 还没放完的消息先放完，下次打开时页面是完整的
    batch = null;
    state.savedScroll = ui.body.scrollTop;
    ui.panel.hidden = true;
    state.run++;
}

function togglePanel() {
    if (ui.panel && !ui.panel.hidden) closePanel();
    else openPanel();
}

// ---------------------------------------------------------------------------
// 接入酒馆：按钮、设置、事件
// ---------------------------------------------------------------------------

function syncButtons() {
    const s = getSettings();
    const t = getStrings();

    let wand = document.getElementById('stcp-wand');
    const menu = document.getElementById('extensionsMenu');
    if (s.enabled && menu && !wand) {
        wand = el('div', 'list-group-item flex-container flexGap5 interactable');
        wand.id = 'stcp-wand';
        wand.tabIndex = 0;
        wand.title = t.open;
        wand.append(el('div', 'fa-solid fa-clock-rotate-left extensionsMenuExtensionButton'), el('span', '', t.title));
        wand.addEventListener('click', () => togglePanel());
        menu.append(wand);
    } else if (!s.enabled && wand) {
        wand.remove();
    }

    let button = document.getElementById('stcp-open');
    const form = document.getElementById('leftSendForm');
    const wanted = s.enabled && s.inputButton;
    if (wanted && form && !button) {
        button = el('div', 'fa-solid fa-clock-rotate-left interactable');
        button.id = 'stcp-open';
        button.tabIndex = 0;
        button.title = t.open;
        button.addEventListener('click', () => togglePanel());
        form.append(button);
    } else if (!wanted && button) {
        button.remove();
    }
}

function addSettingsPanel() {
    const container = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!container || document.getElementById('stcp-settings')) return;
    const t = getStrings();
    const s = getSettings();
    const option = (key, label) => `
        <label class="checkbox_label stcp-option" for="stcp-opt-${key}">
            <input type="checkbox" id="stcp-opt-${key}" data-key="${key}" ${s[key] ? 'checked' : ''}>
            <span>${escapeHtml(label)}</span>
        </label>`;
    const panel = el('div', 'stcp-settings');
    panel.id = 'stcp-settings';
    panel.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>${escapeHtml(t.settingsTitle)}</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                ${option('enabled', t.optEnabled)}
                ${option('inputButton', t.optInputButton)}
                ${option('closeOnInsertMobile', t.optCloseOnInsert)}
                ${option('searchSwipes', t.optSearchSwipes)}
                <small>${escapeHtml(t.settingsDesc)}</small>
            </div>
        </div>
    `;
    panel.addEventListener('change', (e) => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement) || !input.dataset.key) return;
        getSettings()[input.dataset.key] = input.checked;
        saveSettings();
        syncButtons();
        if (!getSettings().enabled) closePanel();
        else render();
    });
    container.append(panel);
}

function registerSlashCommand() {
    const ctx = getCtx();
    try {
        const { SlashCommandParser, SlashCommand, SlashCommandArgument, ARGUMENT_TYPE } = ctx;
        if (!SlashCommandParser?.addCommandObject || !SlashCommand?.fromProps) return;
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'chatpeek',
            callback: (_args, value) => {
                openPanel({ query: typeof value === 'string' ? value : '' });
                return '';
            },
            unnamedArgumentList: SlashCommandArgument?.fromProps
                ? [SlashCommandArgument.fromProps({ description: 'search text', typeList: [ARGUMENT_TYPE.STRING], isRequired: false })]
                : [],
            helpString: getStrings().slashHelp,
        }));
    } catch (error) {
        console.debug('[Chat Peek] slash command not registered', error);
    }
}

export function initChatPeek() {
    const ctx = getCtx();
    if (!ctx) {
        console.warn('[Chat Peek] SillyTavern.getContext() is not available; Chat Peek is disabled.');
        return;
    }
    getSettings();
    addSettingsPanel();
    syncButtons();
    registerSlashCommand();

    const types = ctx.eventTypes ?? ctx.event_types ?? {};
    let changeTimer = null;
    const onChatChanged = () => {
        clearTimeout(changeTimer);
        changeTimer = setTimeout(() => refresh({ soft: true }), 200);
    };
    if (types.CHAT_CHANGED) ctx.eventSource?.on(types.CHAT_CHANGED, onChatChanged);
    // 扩展加载得比菜单早的话，等酒馆就绪后再补一次按钮
    if (types.APP_READY) ctx.eventSource?.on(types.APP_READY, syncButtons);

    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('focusin', updateTargetLabel);

    globalThis.chatPeek = { open: openPanel, close: closePanel, toggle: togglePanel, refresh: () => refresh({ force: true }) };
}
