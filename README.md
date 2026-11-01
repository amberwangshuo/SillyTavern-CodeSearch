# SillyTavern 代码搜索（Code Search）

酒馆（SillyTavern）里的大文本框——自定义 CSS、酒馆助手的脚本、角色卡、预设提示词、世界书条目——想找个东西只能自己慢慢翻。这个扩展给它们加一条搜索栏，中文、英文、代码都能搜：

- **搜索并高亮**：输入即搜，所有匹配处都标出来，当前这一处用更深的颜色；显示「第几个 / 共几个 · 行号」
- **上一个 / 下一个**：Enter 下一个，Shift+Enter 上一个，也可以点按钮；F3 或 Ctrl+G 在编辑器里也能跳
- **光标定位**：点「I」形光标按钮（或在搜索框里按 Esc），光标就落在当前匹配处、焦点回到编辑器，可以直接改——手机上就靠这个按钮
- **区分大小写**、**正则表达式**两个开关
- **一键回顶 / 一键到底**：光标也会跟着跳到开头或结尾
- 电脑上在编辑器里按 **Ctrl+F**（Mac 是 Cmd+F）直接展开并聚焦搜索框；如果当时选中了文字，会自动填进去
- 中文输入法拼字时按 Enter 是在选字，不会被当成「下一个」

## 加在哪些地方

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

## 安装

在酒馆里打开「扩展」面板，点「安装扩展」，粘贴这个仓库的地址：

```
https://github.com/amberwangshuo/SillyTavern-CodeSearch
```

装好后刷新页面。已经装过 1.x 的，在扩展管理里点更新，再刷新页面。

也可以手动安装：把本仓库整个文件夹放到酒馆的 `public/scripts/extensions/third-party/SillyTavern-CodeSearch/`，然后刷新页面。

## 怎么用

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

---

## English

Adds a search bar to SillyTavern's big text fields. Code editors (Custom CSS and its expanded editor, TavernHelper's script editor, other monospace text areas) get the bar right above them; long text fields (character description/greetings/examples/notes, persona, Author's Note, preset prompts, lorebook entry content, message editing, any expanded editor) get a small magnifier icon in the top-right corner that expands the bar. The CodeMirror editors that BaiBai Toolkit (柏宝箱) swaps in for Custom CSS, character description and preset prompts are supported too.

Features: incremental search with highlighting of every match (any language), previous/next (Enter / Shift+Enter, F3, Ctrl+G), an I-beam button (or Esc) that puts the caret on the current match and focuses the editor (the way to jump on phones), match case and regex toggles, a match counter with line number, jump-to-top / jump-to-bottom buttons. Ctrl+F inside an editor opens the bar (prefilled with the current selection). IME composition is respected. Editing the text refreshes the highlights without moving your caret.

Install from the Extensions panel with the URL above. Written against SillyTavern 1.16–1.19, TavernHelper 4.11–4.12 and BaiBai Toolkit 1.1.5.
