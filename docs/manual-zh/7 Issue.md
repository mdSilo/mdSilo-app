# Issue

#手册#

如果阅读是输入，写作是输出，那么 **issue（议题）就是中间的处理过程**。一个 issue 是一个还没想完的念头：书里冒出的问题、一个想法、一件待办、一个要查的东西。mdSilo 提供一个类似 GitHub 的单人 issue 追踪器，存在你的工作区里（`.mdsilo/`），并和你的笔记、书籍连通。

用圆点图标打开（`Ctrl/Cmd + Shift + I`）。

## Issue 列表

- **Open / Closed** 两个标签页，带计数。
- 一个类似GitHub风格查询的过滤栏，例如 `is:open label:question milestone:"Week 1" sort:updated-desc`。不带关键字的文字会搜索标题和正文。其它关键字：`no:milestone`、`is:overdue`、`sort:due`。
- 每一行显示状态、`@编号`、标题、彩色标签、里程碑、子任务和最后更新时间。
- **New issue** 要求填标题和正文（Markdown，用完整的编辑器）。

Issue 的编号是 `@1`、`@2`……，编号永不重复使用：`@12` 永远是同一个念头。

## 一个 issue

打开 issue 可以看到：

- **正文**（是一个编辑器，所以 wiki 链接、`{{ }}` 书链接、公式和图表都可用），以及**时间线**：你的评论和自动事件（opened、closed、labelled、moved、renamed……）。
- **侧栏**：*Labels*、*Milestone*、*Due date*、*Projects*（以及在各项目里的状态）、*Linked notes* 和 *Books*。
- **子任务**：把一个 issue 拆成几个小步骤。
- **Close** / **Reopen**。

新工作区自带标签 `bug`、`enhancement`、`question` 和 `idea`。在 **Labels** 页添加你自己的，可以设颜色和说明。**里程碑**把 issue 归到一个目标下，带截止日期和进度条：“读完这本书”、“第 3 周”、“论文第二章”。

## Projects：看板和表格

看板图标（`Ctrl/Cmd + Shift + K`）显示一个**项目**：按状态排列的 issue。

- **Board**：每个状态一列的看板。拖动卡片就改变它的状态。状态可以标记为*关闭型*（表示已完成）：把卡片放进去，issue 就被关闭。
- **Table**：同样的 issue 排成行，列可排序（标题、状态、标签、里程碑、截止日期、更新时间）。状态可以直接在表里改。
- 可以有多个项目，各有各的状态；一个 issue 可以在多个项目里。新项目从 *Todo / In Progress / Done* 开始。

把项目当成一个主题的成长图：*待读 → 在读 → 消化 → 成文*。

## Issue 从哪里来

关键是 issue 出现在**念头产生的地方**。

| 在哪里 | 怎么做 |
|--------|--------|
| 阅读器 | 选中文字 → **New issue of it**；或任何批注上的同一个按钮 |
| 笔记编辑器 | 选中文字 → **New issue of it**；引文和指回笔记的链接成为正文 |
| 笔记里的复选框 | `- [ ] 某事` 是一个任务；见下文 |
| 笔记里的标签 | `#todo#`、`#doing#`、`#done#` |
| Issues 视图 | **New issue** |

从阅读器来的 issue 带着引文和一条能打开书并定位到那句话的链接；从笔记来的 issue 则链接回笔记。

## 笔记里的任务

写在笔记里的任务会汇总到 Issues 的 **Tasks** 页（`Ctrl/Cmd + Shift + T`）：

- `- [ ] 买这本书` 和 `- [x] 完成`
- `#todo# 给图书馆打电话`、`#doing# 初稿`、`#done# 索引卡`

它们留在自己的笔记里，那才是它们该在的地方。点一个就跳过去，或者**把它变成 issue**：此后任务和 issue 保持同步，勾掉一个，另一个也关闭。

## 双向链接

- 在 issue 里，`[[笔记]]` 链接笔记，`{{书名}}` 链接书。
- 在笔记里，`[@12](issue:12)` 链接 issue（或输入 `[[` 后选一个）。
- 笔记底部列出 **Referenced by issues**；issue 在侧栏里列出它的笔记和书；书在 **Links** 页里列出它们。
- Graph 把 issue 画成节点：open 的是绿环，closed 的是灰环。见 [[8 洞察|洞察]]。

下一章：[[8 洞察|洞察]]。
