// 代码搜索 / Code Search
// 给酒馆里的代码编辑器和长文本框加一条搜索栏：搜索并高亮（中文、代码都行）、上一个/下一个、
// 光标定位、区分大小写、正则，另外有一键回顶、一键到底。
// 原生 textarea 和柏宝箱换上的 CodeMirror 编辑器都支持。

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { attach, detachAll, installWatcher, installHotkeys, getCodeMirrorView } from './core.js';

const MODULE_NAME = 'codeSearch';

const DEFAULT_SETTINGS = {
    codeEditors: true,   // 代码编辑器：自定义 CSS、酒馆助手脚本、其他等宽字体的文本框
    longText: true,      // 长文本框：角色卡、人设、作者注释、预设提示词、世界书条目、消息编辑框等
    expandText: false,   // 长文本框也默认展开搜索栏（默认只在右上角放一个小图标）
    hotkeyAny: false,    // 在任意文本框里按 Ctrl+F 临时加搜索栏
};

const STRINGS = {
    zh: {
        title: '代码搜索',
        desc: '代码编辑器上方直接显示搜索栏；长文本框右上角放一个放大镜小图标，点一下展开。输入即搜，中文、英文、代码都行；Enter 下一个，Shift+Enter 上一个；点「I」形光标按钮或按 Esc，光标就跳到这一处可以直接改。电脑上在编辑器里按 Ctrl+F（Mac 是 Cmd+F）也能展开搜索栏。自定义 CSS、角色描述、预设提示词被柏宝箱换成 CodeMirror 编辑器之后同样可用。',
        optCodeEditors: '代码编辑器（自定义 CSS、酒馆助手脚本、其他等宽字体文本框）',
        optLongText: '长文本框（角色卡描述/开场白/示例对话、人设、作者注释、预设提示词、世界书条目、消息编辑框、放大编辑器等）',
        optExpandText: '长文本框也默认展开搜索栏（不勾则只显示右上角小图标）',
        optHotkeyAny: '在任意文本框里按 Ctrl+F 临时开启搜索栏',
        bar: {
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
        },
    },
    en: {
        title: 'Code Search',
        desc: 'Code editors get a search bar right above them; long text fields get a small magnifier icon in their top-right corner that expands the bar. Search as you type (any language, code or prose); Enter for next, Shift+Enter for previous; the I-beam button or Esc puts the caret on the current match so you can edit. On desktop Ctrl+F (Cmd+F on Mac) inside an editor opens the bar. Works with the CodeMirror editors that BaiBai Toolkit swaps in for Custom CSS, character description and preset prompts.',
        optCodeEditors: 'Code editors (Custom CSS, TavernHelper scripts, other monospace text areas)',
        optLongText: 'Long text fields (character description/greetings/examples, persona, Author\'s Note, preset prompts, lorebook entries, message editing, expanded editors…)',
        optExpandText: 'Expand the bar by default on long text fields too (otherwise only the corner icon shows)',
        optHotkeyAny: 'Ctrl+F in any text area opens a temporary search bar',
        bar: {
            placeholder: 'Search…',
            caseTitle: 'Match case',
            regexTitle: 'Regular expression',
            prevTitle: 'Previous (Shift+Enter)',
            nextTitle: 'Next (Enter)',
            gotoTitle: 'Put the caret on this match and edit (Esc)',
            topTitle: 'Jump to top',
            bottomTitle: 'Jump to bottom',
            closeTitle: 'Hide search bar',
            openTitle: 'Search (Ctrl+F)',
            noResult: 'No results',
            badRegex: 'Invalid regex',
            line: (n) => `line ${n}`,
            tooMany: '+',
        },
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

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = {};
    }
    const settings = extension_settings[MODULE_NAME];
    // 1.x 的旧设置：customCss / tavernHelper / allMonospace 合并成 codeEditors
    if (typeof settings.codeEditors !== 'boolean' && (typeof settings.customCss === 'boolean' || typeof settings.tavernHelper === 'boolean')) {
        settings.codeEditors = settings.customCss !== false || settings.tavernHelper !== false || settings.allMonospace === true;
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (typeof settings[key] !== 'boolean') settings[key] = value;
    }
    return settings;
}

// ---- 哪些框算代码编辑器、哪些算长文本框 ----

const LONG_TEXT_IDS = new Set([
    'description_textarea', 'firstmessage_textarea', 'personality_textarea', 'scenario_pole',
    'mes_example_textarea', 'creator_notes_textarea', 'depth_prompt_prompt',
    'system_prompt_textarea', 'post_history_instructions_textarea',
    'persona_description',
    'extension_floating_prompt', 'extension_floating_chara', 'extension_floating_default',
    'completion_prompt_manager_popup_entry_form_prompt',
    'chat_examples_override', 'chat_scenario_override', 'chat_system_prompt_override',
    'sysprompt_content', 'sysprompt_post_history', 'context_story_string',
    'memory_contents', 'memory_prompt', 'vectors_summary_prompt',
]);

const NEVER_IDS = new Set(['send_textarea']);

function isCustomCssArea(ta) {
    if (ta.id === 'customCSS') return true;
    return ta.classList.contains('maximized_textarea') && ta.dataset.for === 'customCSS';
}

function isTavernHelperCodeArea(ta) {
    // 酒馆助手的代码文本框都带 Tailwind 的 font-(family-name:--monoFontFamily)! 类
    return ta.classList.contains('text_pole') && ta.className.includes('--monoFontFamily');
}

function isCodeArea(ta) {
    if (isCustomCssArea(ta) || isTavernHelperCodeArea(ta)) return true;
    if (!ta.classList.contains('monospace')) return false;
    if (ta.classList.contains('maximized_textarea')) return true;
    if (ta.hasAttribute('rows')) return ta.rows >= 3;
    // 没写 rows 的等宽框：停止字符串那种会跟着内容长高的（autoSetHeight）太小，不要
    return !ta.classList.contains('autoSetHeight');
}

function isLongTextArea(ta) {
    if (LONG_TEXT_IDS.has(ta.id)) return true;
    const cls = ta.classList;
    if (cls.contains('mdHotkeys') || cls.contains('maximized_textarea')) return true;
    if (cls.contains('edit_textarea') || cls.contains('reasoning_edit_textarea')) return true;
    if (cls.contains('alternate_greeting_text')) return true;
    if (ta.name === 'content' && ta.closest('.world_entry')) return true;
    const rows = ta.hasAttribute('rows') ? ta.rows : 0;
    if (rows >= 6) return true;
    if (ta.hasAttribute('data-macros') && rows >= 3) return true;
    return false;
}

/** 返回 null 表示不加；否则返回附加选项（collapsed：默认收起成小图标）。 */
function classifyTextarea(ta, s) {
    if (NEVER_IDS.has(ta.id) || ta.closest('.stcs-toolbar')) return null;
    if (getComputedStyle(ta).display === 'none') return null; // 被柏宝箱等藏起来的原始框
    if (s.codeEditors && isCodeArea(ta)) return { collapsed: false };
    if (s.longText && isLongTextArea(ta)) return { collapsed: !s.expandText };
    return null;
}

/** CodeMirror 编辑器：柏宝箱把它插在被藏起来的原 textarea 后面，按那个 textarea 来分类。 */
function classifyCodeMirror(editor, s) {
    if (!getCodeMirrorView(editor)) return null;
    const wrapper = editor.parentElement;
    let source = wrapper?.previousElementSibling;
    if (!(source instanceof HTMLTextAreaElement)) {
        source = wrapper?.parentElement?.querySelector(':scope > textarea');
    }
    if (source instanceof HTMLTextAreaElement) {
        if (s.codeEditors && isCodeArea(source)) return { collapsed: false };
        if (s.longText && isLongTextArea(source)) return { collapsed: !s.expandText };
        return null;
    }
    // 不知道替换的是谁：当成代码编辑器
    return s.codeEditors || s.longText ? { collapsed: !s.codeEditors && !s.expandText } : null;
}

function classify(host) {
    const s = getSettings();
    if (host instanceof HTMLTextAreaElement) return classifyTextarea(host, s);
    if (host.classList.contains('cm-editor')) return classifyCodeMirror(host, s);
    return null;
}

function getAttachOptions() {
    return { strings: getStrings().bar };
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function addSettingsPanel(watcher) {
    const container = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!container || document.getElementById('stcs-settings')) return;
    const t = getStrings();
    const s = getSettings();
    const option = (key, label) => `
        <label class="checkbox_label stcs-option" for="stcs-opt-${key}">
            <input type="checkbox" id="stcs-opt-${key}" data-key="${key}" ${s[key] ? 'checked' : ''}>
            <span>${escapeHtml(label)}</span>
        </label>`;
    const panel = document.createElement('div');
    panel.id = 'stcs-settings';
    panel.className = 'stcs-settings';
    panel.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>${escapeHtml(t.title)}</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                ${option('codeEditors', t.optCodeEditors)}
                ${option('longText', t.optLongText)}
                ${option('expandText', t.optExpandText)}
                ${option('hotkeyAny', t.optHotkeyAny)}
                <small>${escapeHtml(t.desc)}</small>
            </div>
        </div>
    `;
    panel.addEventListener('change', (e) => {
        const input = e.target;
        if (!(input instanceof HTMLInputElement) || !input.dataset.key) return;
        getSettings()[input.dataset.key] = input.checked;
        saveSettingsDebounced();
        detachAll({ keepTemporary: true });
        watcher.rescan();
    });
    container.append(panel);
}

jQuery(() => {
    getSettings();
    const watcher = installWatcher(classify, getAttachOptions);
    installHotkeys({
        allowAnyEditor: () => getSettings().hotkeyAny,
        getOptions: getAttachOptions,
    });
    addSettingsPanel(watcher);

    // 给其他扩展/脚本留个入口：window.codeSearch.attach(textarea 或 .cm-editor)
    window.codeSearch = {
        attach: (el, options = {}) => attach(el, { ...getAttachOptions(), force: true, ...options }),
        rescan: watcher.rescan,
    };
});
