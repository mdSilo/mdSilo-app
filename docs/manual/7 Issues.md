# Issues

#manual#

If reading is the input and writing is the output, **issues are the process in between**. An issue is a thought you have not finished yet: a question from a book, an idea, a to-do, a thing to look up. mdSilo gives you a GitHub-like, single-user issue tracker, stored in your workspace (`.mdsilo/`), and ties it to your notes and books.

Open it with the circle-dot icon (`Ctrl/Cmd + Shift + I`).

## The issue list

- **Open / Closed** tabs with counts.
- A filter bar that understands a GitHub-style query, e.g. `is:open label:question milestone:"Week 1" sort:updated-desc`. Text without a keyword searches titles and bodies. Other keywords: `no:milestone`, `is:overdue`, `sort:due`.
- Each row shows the state, `@number`, title, coloured labels, milestone, subtasks and the time of the last update.
- **New issue** asks for a title and a body (Markdown, in the full editor).

Issues are numbered `@1`, `@2`... and the numbers are never reused: `@12` is always the same thought.

## An issue

Open an issue to see:

- The **body** (an editor, so wiki links, `{{ }}` book links, math and diagrams work), and the **timeline**: your comments and automatic events (opened, closed, labelled, moved, renamed...).
- The **sidebar**: *Labels*, *Milestone*, *Due date*, *Projects* (with the status in each), *Linked notes* and *Books*.
- **Subtasks**: break an issue into smaller ones.
- **Close** / **Reopen**.

New workspaces start with the labels `bug`, `enhancement`, `question` and `idea`. Add your own in the **Labels** tab, with colours and descriptions. A **milestone** groups issues towards a goal, with a due date and a progress bar: "finish this book", "week 3", "thesis chapter 2".

## Projects: boards and tables

The board icon (`Ctrl/Cmd + Shift + K`) shows a **project**: the issues arranged by status.

- **Board**: a Kanban with a column per status. Drag a card to change its status. Statuses can be marked as *closing*: dropping a card there closes the issue.
- **Table**: the same issues as rows with sortable columns (title, status, labels, milestone, due date, updated). Edit the status in place.
- Several projects, each with its own statuses; an issue can be in several. A new project starts with *Todo / In Progress / Done*.

Use a project as the growth chart of a subject: *To read → Reading → Digesting → Written up*.

## Where issues come from

The point is that an issue appears **where the thought happens**.

| Where | How |
|-------|-----|
| The Reader | Select text → **New issue of it**; or the same button on any annotation |
| The note editor | Select text → **New issue of it**; the quote and a link to the note become the body |
| Checkboxes in a note | `- [ ] something` is a task; see below |
| Hashtags in a note | `#todo#`, `#doing#`, `#done#` |
| The Issues view | **New issue** |

When an issue comes from the Reader, it carries the quote and a link that opens the book at that sentence. When it comes from a note, it links back to the note.

## Tasks inside notes

Tasks written in notes are collected in the **Tasks** tab of Issues (`Ctrl/Cmd + Shift + T`):

- `- [ ] buy the book` and `- [x] done`
- `#todo# call the library`, `#doing# first draft`, `#done# index cards`

They stay in their notes, where they belong. Click one to jump to it, or **turn it into an issue**: the task and the issue stay in sync afterwards, checking one closes the other.

## Links in both directions

- In an issue, `[[Note]]` links a note and `{{Book}}` links a book.
- In a note, `[@12](issue:12)` links an issue (or pick one after typing `[[`).
- A note lists **Referenced by issues** at the bottom; an issue lists its notes and books in the sidebar; a book lists them in its **Links** tab.
- The Graph draws issues as nodes: green rings for open issues, grey for closed. See [[8 Insight|Insight]].

Next: [[8 Insight|Insight]].
