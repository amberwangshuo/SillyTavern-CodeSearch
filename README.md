# SillyTavern 代码搜索（Code Search）

酒馆（SillyTavern）的自定义 CSS 和酒馆助手的脚本编辑器都是一个光秃秃的大文本框，想找个东西只能自己慢慢翻。这个扩展给它们加一条搜索栏：

- **搜索并高亮**：输入即搜，所有匹配处都标出来，当前这一处用更深的颜色；显示「第几个 / 共几个 · 行号」
- **上一个 / 下一个**：Enter 下一个，Shift+Enter 上一个，也可以点按钮；F3 或 Ctrl+G 在文本框里也能跳
- **区分大小写**、**正则表达式**两个开关
- **一键回顶 / 一键到底**：光标也会跟着跳到开头或结尾，点完就能直接打字
- 在文本框里按 **Ctrl+F**（Mac 是 Cmd+F）直接聚焦搜索框；如果当时选中了文字，会自动填进去
- 在搜索框里按 **Esc** 回到文本框，光标停在当前匹配处

默认加在这些地方：

- **用户设置 → 自定义 CSS**，以及它的放大编辑器
- **酒馆助手**的脚本编辑器：脚本内容、作者备注，以及放大编辑器

在扩展面板的「代码搜索」里还可以勾选：酒馆里所有等宽字体的文本框（语法、停止字符串等），或者在任意文本框里按 Ctrl+F 临时开启搜索栏。

在 SillyTavern 1.19.0 和酒馆助手 4.12 的代码结构上写的。

## 安装

在酒馆里打开「扩展」面板，点「安装扩展」，粘贴这个仓库的地址：

```
https://github.com/amberwangshuo/SillyTavern-CodeSearch
```

装好后刷新页面。

也可以手动安装：把本仓库整个文件夹放到酒馆的 `public/scripts/extensions/third-party/SillyTavern-CodeSearch/`，然后刷新页面。

## 怎么用

1. 打开自定义 CSS，或者在酒馆助手里点开一个脚本的编辑。文本框上方会多一条搜索栏。
2. 在搜索框里输入要找的内容，匹配的地方会高亮，文本框自动滚到第一处。
3. Enter / Shift+Enter 或者上下箭头按钮在匹配之间跳；需要改的时候按 Esc 或者直接点进文本框。
4. 右边的双箭头按钮：回到顶部、跳到底部。
5. 搜索栏最右边的 × 关掉这条搜索栏（下次重新打开编辑器会再出现）。

酒馆助手的脚本超过 3000 字时会先显示只读预览，点「展开编辑」或放大按钮之后搜索栏才会出现。

## 原理

搜索栏是插在文本框前面的一个普通元素；高亮是在文本框上面盖了一层字体、内边距、换行都和文本框一致的透明层，只画匹配处的底色，随文本框一起滚动，不碰文本框本身的内容和事件，所以酒馆和酒馆助手保存时拿到的还是原来的值。

## 给其他扩展用

加载后会挂一个 `window.codeSearch`：

```js
window.codeSearch.attach(textareaElement); // 给任意 textarea 加搜索栏
window.codeSearch.rescan();                 // 重新扫描页面
```

---

## English

Adds a search bar to SillyTavern's Custom CSS editor (including its expanded editor) and to TavernHelper's script editor (script content, author notes, expanded editor): incremental search with highlighting of every match, previous/next (Enter / Shift+Enter, F3, Ctrl+G), match case and regex toggles, a match counter with line number, and jump-to-top / jump-to-bottom buttons that also move the caret. Ctrl+F inside the text area focuses the search box (prefilled with the current selection); Esc returns to the text area at the current match.

Options in the Extensions panel let you enable it for every monospace text area in SillyTavern, or open a temporary search bar with Ctrl+F in any text area.

Install from the Extensions panel with the URL above. Written against SillyTavern 1.19.0 and TavernHelper 4.12.
