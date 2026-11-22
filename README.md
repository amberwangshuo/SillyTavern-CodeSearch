# SillyTavern 代码搜索（Code Search）

两个功能：给酒馆里的大文本框加**搜索栏**；以及**聊天速查**——不切换聊天，直接翻看、搜索同一个角色其他聊天里的文字，一键复制或插入输入框（见下面「聊天速查」一节）。

酒馆（SillyTavern）里的大文本框——自定义 CSS、酒馆助手的脚本、角色卡、预设提示词、世界书条目——想找个东西只能自己慢慢翻。这个扩展给它们加一条搜索栏，中文、英文、代码都能搜：

- **搜索并高亮**：输入即搜，所有匹配处都标出来，当前这一处用更深的颜色；显示「第几个 / 共几个 · 行号」
- **上一个 / 下一个**：Enter 下一个，Shift+Enter 上一个，也可以点按钮；F3 或 Ctrl+G 在编辑器里也能跳
- **光标定位**：点「I」形光标按钮（或在搜索框里按 Esc），光标就落在当前匹配处、焦点回到编辑器，可以直接改——手机上就靠这个按钮
- **区分大小写**、**正则表达式**两个开关
- **一键回顶 / 一键到底**：光标也会跟着跳到开头或结尾
- 电脑上在编辑器里按 **Ctrl+F**（Mac 是 Cmd+F）直接展开并聚焦搜索框；如果当时选中了文字，会自动填进去
- 中文输入法拼字时按 Enter 是在选字，不会被当成「下一个」

## 聊天速查（2.1 新增）

同一个角色开了好几个聊天测不同的预设，前面聊天里写好、改好的文字想搬到新聊天里用，不用再切过去复制、切回来粘贴了。点输入框左边的 <kbd>🕘</kbd> 按钮（或魔法棒菜单里的「聊天速查」，或斜杠命令 `/chatpeek`），旁边会开一个面板：

- **聊天列表**：当前角色（群聊也行）的全部聊天，最近聊过的排前面，正在用的那个标「当前」。点一个进去，就能在面板里从头到尾看它的消息，**酒馆本身不会切换聊天**。
- **跨聊天搜索**：在搜索框里打字，这个角色所有聊天里的匹配消息按聊天分组列出来，关键词高亮。空格隔开的几个词要同时出现在同一条消息里；想搜带空格的一整句就加引号，如 `"good night"`。不区分大小写。
- **复制 / 插入**：每条消息右上角两个按钮。「复制」到剪贴板；「插入」直接放进输入框的光标处（正在编辑某条消息的话，就插到那条消息的编辑框里），面板底部会写明插到哪。拿到的是消息的原文（没经过正则美化的那份）。
- **只取一部分**：先在面板里选中一段文字，按钮会变成「复制选中 / 插入选中」。
- **上下文**：搜索结果里点「上下文」，跳到原聊天里那条消息的位置看前后文；点左上角的返回箭头回到搜索结果。
- **备选回复（swipe）**：有多个 swipe 的消息可以用 ‹ › 翻看，搜索也会搜到没被选中的 swipe；复制、插入的是面板上正显示的那一版。
- 「全部 / 我 / 角色」筛选：只看自己写的，或只看角色回的。
- 长消息默认只显示一段（搜索时显示匹配处附近），点「展开全文」看全部；不管展没展开，按钮取的都是整条。

电脑上面板停在右侧，不挡输入，可以一边看一边聊；拖面板内侧的边可以调宽度，标题栏的 ⇄ 可以换到左边。手机上面板铺满全屏，点「插入」后自动收起（可在设置里关掉）。

面板是只读的，不会改动任何聊天文件。当前聊天直接读内存里的内容，所以刚改过还没存盘的也能搜到；其他聊天读过一次后会缓存，切换聊天或点刷新按钮时更新。

## 搜索栏加在哪些地方

**代码编辑器**（搜索栏直接显示在上方）：

- 用户设置 → 自定义 CSS，以及它的放大编辑器
- 酒馆助手的脚本编辑器：脚本内容、作者备注、放大编辑器
- 其他等宽字体的多行文本框（语法、JSON schema、记事本等）

**长文本框**（右上角一个放大镜小图标，点一下才展开，不占地方）：

- 角色卡：描述、开场白、备用开场白、性格、场景、对话示例、创作者注释、角色备注、系统提示词、历史后指令
- 人设描述、作者注释（Author's Note）
- 预设的提示词编辑框、系统提示词 / 上下文模板
- 世界书条目的内容
- 聊天里正在编辑的那条消息
- 任何「放大编辑器」弹窗

**被柏宝箱换成 CodeMirror 的编辑器**（自定义 CSS、角色描述、预设提示词）同样支持：搜索栏一样加在上方，高亮画在编辑器文字上，跳转、定位、回顶到底都能用。

扩展面板的「代码搜索」里可以分别开关代码编辑器 / 长文本框，让长文本框也默认展开搜索栏，或者允许在任意文本框里按 Ctrl+F 临时开启搜索栏。

扩展面板的「聊天速查」里可以整个关掉聊天速查、隐藏输入框左边的按钮、关掉手机上插入后自动收起、或者让搜索不搜备选回复。

## 安装

在酒馆里打开「扩展」面板，点「安装扩展」，粘贴这个仓库的地址：

```
https://github.com/amberwangshuo/SillyTavern-CodeSearch
```

装好后刷新页面。已经装过旧版的，在扩展管理里点更新，再刷新页面。

也可以手动安装：把本仓库整个文件夹放到酒馆的 `public/scripts/extensions/third-party/SillyTavern-CodeSearch/`，然后刷新页面。

## 搜索栏怎么用

1. 打开自定义 CSS、酒馆助手的脚本，或者角色卡、预设、世界书。代码编辑器上方会直接有搜索栏；长文本框右上角有个小放大镜，点一下展开。
2. 在搜索框里输入要找的内容，匹配的地方会高亮，编辑器自动滚到第一处。
3. Enter / Shift+Enter 或者上下箭头按钮在匹配之间跳。
4. 要改的时候点「I」形光标按钮（或按 Esc），光标就在那一处，直接打字。
5. 右边的双箭头按钮：回到顶部、跳到底部。
6. 搜索栏最右边的 × 收起搜索栏，右上角的小图标还在，随时再展开。

酒馆助手的脚本超过 3000 字时会先显示只读预览，点「展开编辑」或放大按钮之后搜索栏才会出现。

## 原理

- 原生 textarea：搜索栏是插在文本框前面的一个普通元素；高亮是在文本框上面盖了一层字体、内边距、换行都和文本框一致的透明层，只画匹配处的底色，随文本框一起滚动，不碰文本框本身的内容和事件，所以酒馆和酒馆助手保存时拿到的还是原来的值。
- CodeMirror 6（柏宝箱）：从编辑器 DOM 上拿到 EditorView 实例，用它读取全文、设置选区和滚动；高亮用浏览器的 CSS Custom Highlight API 画在视野内的文字上，不往编辑器里塞任何节点。太老的浏览器没有这个 API 时，只有当前匹配处（选区）可见，其他功能照常。
- 编辑内容时只刷新匹配和高亮，不会把光标拽回上一处匹配。

## 给其他扩展用

加载后会挂一个 `window.codeSearch`：

```js
window.codeSearch.attach(element);  // 给任意 textarea 或 .cm-editor 加搜索栏；element 也可以是编辑器内部的元素
window.codeSearch.rescan();         // 重新扫描页面
```

聊天速查挂在 `window.chatPeek`：

```js
window.chatPeek.open({ query: '月光' });  // 打开面板并搜索；不传 query 就只打开
window.chatPeek.toggle();
window.chatPeek.close();
```

聊天速查的代码全在 `peek.js` 和 `style.css` 里 `stcp-` 开头的那一段，不依赖搜索栏的代码。

---

## English

Adds a search bar to SillyTavern's big text fields. Code editors (Custom CSS and its expanded editor, TavernHelper's script editor, other monospace text areas) get the bar right above them; long text fields (character description/greetings/examples/notes, persona, Author's Note, preset prompts, lorebook entry content, message editing, any expanded editor) get a small magnifier icon in the top-right corner that expands the bar. The CodeMirror editors that BaiBai Toolkit (柏宝箱) swaps in for Custom CSS, character description and preset prompts are supported too.

Features: incremental search with highlighting of every match (any language), previous/next (Enter / Shift+Enter, F3, Ctrl+G), an I-beam button (or Esc) that puts the caret on the current match and focuses the editor (the way to jump on phones), match case and regex toggles, a match counter with line number, jump-to-top / jump-to-bottom buttons. Ctrl+F inside an editor opens the bar (prefilled with the current selection). IME composition is respected. Editing the text refreshes the highlights without moving your caret.

**Chat Peek (new in 2.1):** a side panel that lists every chat of the current character (or group), lets you read any of them and search across all of them without switching chats, and copies a message — or just the part you selected — to the clipboard or inserts it at the caret of the message box (or of the message you are editing). Open it with the button left of the message box, "Chat Peek" in the wand menu, or `/chatpeek [text]`. It is read-only and never modifies chat files.

Install from the Extensions panel with the URL above. Written against SillyTavern 1.16–1.19, TavernHelper 4.11–4.12 and BaiBai Toolkit 1.1.5.
