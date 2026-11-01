// 代码搜索 / Code Search
// 给酒馆的自定义 CSS 和酒馆助手的脚本编辑器加一条搜索栏：
// 搜索并高亮、上一个/下一个、区分大小写、正则，另外有一键回顶、一键到底。

import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { attach, detachAll, installWatcher, installHotkeys } from './core.js';

const MODULE_NAME = 'codeSearch';

const DEFAULT_SETTINGS = {
    customCss: true,      // 酒馆「用户设置 → 自定义 CSS」及其放大编辑器
    tavernHelper: true,   // 酒馆助手的脚本编辑器（脚本内容、作者备注、放大编辑器）
    allMonospace: false,  // 酒馆里所有等宽字体的文本框（语法、停止字符串等）
    hotkeyAny: false,     // 在任意文本框里按 Ctrl+F 临时加搜索栏
};

const STRINGS = {
    zh: {
        title: '代码搜索',
        desc: '在下面勾选的文本框上方加一条搜索栏：搜索并高亮、上一个/下一个、区分大小写、正则，以及一键回顶、一键到底。在文本框里按 Ctrl+F 可以直接聚焦搜索框，Enter 下一个，Shift+Enter 上一个，Esc 回到文本框并停在当前匹配处。',
        optCustomCss: '自定义 CSS（用户设置里的，以及放大编辑器）',
        optTavernHelper: '酒馆助手脚本编辑器（脚本内容、作者备注、放大编辑器）',
        optAllMonospace: '酒馆里所有等宽字体的文本框',
        optHotkeyAny: '在任意文本框里按 Ctrl+F 临时开启搜索栏',
        bar: {
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
        },
    },
    en: {
        title: 'Code Search',
        desc: 'Adds a search bar above the text areas ticked below: search with highlighting, previous/next, case sensitivity, regex, plus jump-to-top and jump-to-bottom buttons. Press Ctrl+F inside the text area to focus the search box, Enter for next, Shift+Enter for previous, Esc to return to the text area at the current match.',
        optCustomCss: 'Custom CSS (user settings and its expanded editor)',
        optTavernHelper: 'TavernHelper script editor (script content, author notes, expanded editor)',
        optAllMonospace: 'Every monospace text area in SillyTavern',
        optHotkeyAny: 'Ctrl+F in any text area opens a temporary search bar',
        bar: {
            placeholder: 'Search code…',
            caseTitle: 'Match case',
            regexTitle: 'Regular expression',
            prevTitle: 'Previous (Shift+Enter)',
            nextTitle: 'Next (Enter)',
            topTitle: 'Jump to top',
            bottomTitle: 'Jump to bottom',
            closeTitle: 'Close search bar',
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
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (typeof settings[key] !== 'boolean') settings[key] = value;
    }
    return settings;
}

function isTavernHelperCodeArea(ta) {
    // 酒馆助手的代码文本框都带 Tailwind 的 font-(family-name:--monoFontFamily)! 类
    return ta.classList.contains('text_pole') && ta.className.includes('--monoFontFamily');
}

function isCustomCssArea(ta) {
    if (ta.id === 'customCSS') return true;
    return ta.classList.contains('maximized_textarea') && ta.dataset.for === 'customCSS';
}

function isMonospaceArea(ta) {
    return ta.classList.contains('monospace') || ta.className.includes('--monoFontFamily');
}

function shouldAttach(ta) {
    const s = getSettings();
    if (ta.closest('.stcs-toolbar')) return false;
    if (s.customCss && isCustomCssArea(ta)) return true;
    if (s.tavernHelper && isTavernHelperCodeArea(ta)) return true;
    if (s.allMonospace && isMonospaceArea(ta)) return true;
    return false;
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
                ${option('customCss', t.optCustomCss)}
                ${option('tavernHelper', t.optTavernHelper)}
                ${option('allMonospace', t.optAllMonospace)}
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
    const watcher = installWatcher(shouldAttach, getAttachOptions);
    installHotkeys({
        allowAnyTextarea: () => getSettings().hotkeyAny,
        getOptions: getAttachOptions,
    });
    addSettingsPanel(watcher);

    // 给其他扩展/脚本留个入口：window.codeSearch.attach(textarea)
    window.codeSearch = {
        attach: (ta) => attach(ta, { ...getAttachOptions(), force: true }),
        rescan: watcher.rescan,
    };
});
