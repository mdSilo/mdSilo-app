# Plan: Built-in Issue Tracker in the Knowledge Base (Issues + Projects, Github-like)

## Context
mdSilo today has notes, a free-form Kanban (`kanban.json`) and a Tasks view built from checkboxes and hashtags. What's missing is a structured way to track work items the way GitHub Issues does. Goal: a **single-user** issue system in the open workspace (`initDir`) with **labels, milestones, comments/timeline**, a **separate Project view** (board + table, like GitHub Projects) and **two-way references to notes**.

Decisions confirmed with you:
- Storage: one `issues.json` in `initDir`, next to `kanban.json`.
- Kanban: a new, separate **Project** view. The existing free-form Kanban stays as it is.
  - **Update:** the free-form Kanban was later merged into Projects. On load, `kanban.json` boards are converted once by `migrateKanbans` (`src/components/issue/migrateKanban.ts`): boards → projects, columns → statuses, cards → issues. The file is then kept as `kanban.json.bak` and removed; only `issues.json` is used afterwards.
  - **Update:** the Task view was also merged: tasks written in notes as `#todo#`, `#doing#` or `#done#` are listed in the Issues view's Tasks tab (`src/components/issue/noteTasks.ts`, `NoteTaskList.tsx`). Each links to its note and can become an issue linked to it (`issue.noteTask` remembers the source); `#done#` tasks become closed issues. The checkbox-based task lists of the old view were dropped.
- Note references: two-way. Issues link to notes, notes link to issues, and the note page shows "Referenced by issues".
- Comments plus an automatic event timeline.

## Data model — `src/components/issue/types.ts`
```ts
type IssueState = 'open' | 'closed';
type Label     = { id: string; name: string; color: string; description?: string };
type Milestone = { id: string; title: string; description?: string; dueOn?: string; state: IssueState };
type TimelineItem =
  | { id; kind: 'comment'; body: string; createdAt; updatedAt? }
  | { id; kind: 'event'; event: 'opened'|'closed'|'reopened'|'labeled'|'unlabeled'|'milestoned'|'demilestoned'|'renamed'|'status'; detail?: string; createdAt };
type Issue = {
  number: number;            // human id, #12 (monotonic, never reused)
  title: string; body: string;          // markdown, may contain [[note]] links
  state: IssueState; closedAt?: string;
  labels: string[];          // Label ids
  milestone?: string;        // Milestone id
  notes: string[];           // explicitly linked note paths (note.id === file_path)
  timeline: TimelineItem[];
  createdAt: string; updatedAt: string;
};
type ProjectStatus = { id: string; name: string; color?: string; closes?: boolean }; // closes => moving here closes the issue
type Project = {
  id: string; title: string; description?: string;
  statuses: ProjectStatus[];                 // board columns
  items: { issue: number; status: string; order: number }[];
  layout: 'board' | 'table';
};
type IssueData = { version: 1; nextNumber: number; issues: Issue[]; labels: Label[]; milestones: Milestone[]; projects: Project[] };
```
Defaults for a new workspace: labels `bug`, `enhancement`, `question`, `idea`, plus one project "Default" with statuses `Todo / In Progress / Done(closes)`.

## Data layer
**`src/components/issue/issueStore.ts`**: a zustand slice, kept separate from the persisted main store so nothing goes into LOCAL_DATA_DIR:
- `load(initDir)` reads `issues.json` via `FileAPI` (same pattern as `src/components/view/kanban.tsx:20-31`). If the file is missing or broken, it falls back to defaults. It also migrates by `version`.
- `save()` writes the JSON, debounced at ~300 ms, with `new FileAPI('issues.json', initDir)`.
- Mutations are pure functions in **`issueOps.ts`** so they are easy to unit test: `createIssue`, `updateIssue`, `setState` (which appends an event), `addLabel/removeLabel`, `setMilestone`, `addComment/editComment/deleteComment`, `linkNote/unlinkNote`, the CRUD for label, milestone and project, `moveProjectItem(projectId, issue, status, order)` (applies `closes` and appends a status event), and `renameNoteRefs(oldPath, newPath, oldTitle, newTitle)`.
- Selectors: `filterIssues(issues, query)`, which parses a GitHub-style query string such as `is:open label:bug milestone:"v1" no:milestone sort:updated-desc` plus free text. Also `milestoneProgress(m)`, which counts open and closed issues.
- Reuse `genId` from `src/utils/helper.ts` and `fmtDatetime` / `getStrDate` for dates.

## Views and routing
- `src/context/viewReducer.ts`: add the actions `{view:'issues'}`, `{view:'issue', number}`, `{view:'project', projectId?}` and an `issueNumber?/projectId?` field on `ViewState`.
- `src/components/view/MainView.tsx`: route the new views.
- `src/components/sidebar/SideMenu.tsx`: add an `IssuesButton` (TbCircleDot) and a `ProjectButton` (TbLayoutBoardSplit), shown when `currentDir` is set. Hotkeys: `mod+shift+i` and `mod+shift+p`. Check first that these don't collide with existing keys.

### Issue list: `src/components/view/issues.tsx`
- Open/Closed tabs with counts, a filter input (the query syntax above), and dropdowns for Labels, Milestones and Sort.
- Rows show the state icon, `#n` and title, label chips (colored), the milestone, the comment count and the updated time.
- "New issue" opens an inline form with title and body. Clicking a row goes to the issue view.
- A sub-tab "Labels | Milestones" offers CRUD: color picker (reuse the `SetColor` palette idea from `Board.tsx`), milestone due date and a progress bar.

### Issue detail: `src/components/issue/IssueDetail.tsx`
- Header: editable title, state badge, Close/Reopen button.
- Main column: body in `MsEditor`, then the timeline (comments plus events), then a comment box (also `MsEditor`).
- Sidebar: Labels picker, Milestone picker, Projects (add to project and pick a status), Linked notes (search with `useNoteSearch`, open with `useOnNoteLinkClick`).
- Wire `MsEditor` the way `Note.tsx:383-405` does: `onSearchLink` returns notes **and** issues, `onOpenLink` handles note titles, URLs and `issue:` links. Pull that link logic into a shared hook, **`src/editor/hooks/useLinkHandlers.ts`**, so Note.tsx and the issue editors use the same code (Note.tsx keeps its create-note behavior).

### Project view: `src/components/view/project.tsx` + `src/components/issue/project/*`
- Project switcher plus "new project", and a Board/Table layout toggle.
- **Board**: columns are `statuses` and cards are issue cards (`#n`, title, label chips, milestone). Drag and drop uses `@dnd-kit` with the same sensor and DragOverlay pattern as `src/components/kanban/Board.tsx`, but the code is written fresh against `Project.items`, not the free-form `Card`. Dropping a card calls `moveProjectItem`, and a `closes` column closes the issue. Columns support add, rename, reorder, delete and the `closes` toggle. Each column has "+ Add item", which either quick-creates an issue or picks an existing one.
- **Table**: columns are `# / Title / Status / Labels / Milestone / Updated`. They are sortable, Status is editable inline, and the toolbar has a filter that reuses `filterIssues`.
- Clicking a card opens the issue detail in a slide-over `BaseModal` (reuse `components/settings/BaseModal`) so the board stays visible.

## Two-way note references
1. **Issue → note**: `[[Note Title]]` in an issue body or comment works through the shared link handlers. The explicit `issue.notes[]` list sits in the sidebar.
2. **Note → issue**: notes write `[#12](issue:12)`. Typing `[[` in a note offers issues too, because `onSearchLink` returns `{title:'#12 title', url:'issue:12'}`. In `Note.tsx`, `onOpenLink` handles `href.startsWith('issue:')` → `dispatch({view:'issue', number})`. This avoids clashing with the hashtag parser (`#tag`).
3. **Note page panel**: add `src/components/note/IssueRefs.tsx` below Backlinks in `Note.tsx:~410`. It lists issues whose `notes[]` contains this note's path, or whose body or comments contain `[[title]]`. The matching function `computeIssueRefs(issues, noteId, title)` mirrors `computeLinkedBacklinks` in `src/components/note/backlinks/useBacklinks.ts`.
4. **Issue page "Mentioned in notes"**: scan `store.notes` content for `issue:N` (debounced, like `useBacklinks`).
5. **Rename**: in `Note.tsx` `onTitleChange` (next to `updateCardLinks`, line ~160), call `renameNoteRefs(oldPath,newPath,oldTitle,newTitle)`. It updates `notes[]` paths and rewrites `[[old]]` → `[[new]]` in bodies and comments. When a note is deleted (`useDeleteNote`), leave the stale entry visible but greyed out; don't delete it.

## Files
New: `src/components/issue/{types.ts, issueOps.ts, issueStore.ts, filter.ts, IssueDetail.tsx, IssueList.tsx, LabelChip.tsx, LabelManager.tsx, MilestoneManager.tsx, Timeline.tsx, pickers/*.tsx, project/{ProjectBoard.tsx, ProjectTable.tsx, ProjectCard.tsx, ProjectColumn.tsx}}`, `src/components/view/{issues.tsx, project.tsx}`, `src/components/note/IssueRefs.tsx`, `src/editor/hooks/useLinkHandlers.ts`.
Modified: `src/context/viewReducer.ts`, `src/components/view/MainView.tsx`, `src/components/sidebar/SideMenu.tsx`, `src/components/note/Note.tsx`, `README.md` feature list, and the default welcome text in `MainView.tsx`.
No Rust or Tauri changes: `FileAPI` read/write already covers this.

## Implementation order
1. types + `issueOps` + `filter` + tests
2. `issueStore` (load/save) + tests with mocked `file/files` (pattern from `kanbanView.test.tsx`)
3. Routing + SideMenu + Issue list + New issue
4. Issue detail: editor, timeline, comments, label and milestone pickers, label and milestone managers
5. Project view: board with dnd, then table, then the issue slide-over
6. Note integration: shared link hook, `issue:` links, IssueRefs panel, rename sync
7. Docs and polish (dark mode classes match the existing `dark:` usage)
8. full coverage test  

## Verification
- `yarn test`: new unit tests for `issueOps` (numbering, events, closes-on-move, renameNoteRefs), `filter` (query parsing), and the store load/save (missing or corrupt file). Component tests for the issue list, detail and project board, following `src/components/view/kanbanView.test.tsx` and `testUtils.renderWithView`. Existing tests must still pass, especially `Note.test.tsx` and `views.test.tsx`.
- `yarn tc` (type check) and `yarn lint`.
- Manual run (`yarn tauri dev`) on a sample workspace: create labels, a milestone and issues; filter `is:open label:bug`; close an issue by dragging it to Done and check the timeline event; link a note from the issue and confirm the note page shows it; write `[#1](issue:1)` in a note and click it; rename the note and confirm the issue's link updates; reload the app and confirm `issues.json` persists everything.
