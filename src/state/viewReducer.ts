import { store } from "@/state/store";
import { setWindowTitle } from "@/workspace/util";
import { issueLabel } from "@/lib/parseNote";

export const initialState = { view: "default" };

/** tabs of the Issues view; tasks replaced the old Task view */
export type IssuesTab = "issues" | "tasks" | "labels" | "milestones";

type ViewParams = { noteId: string; stackIds?: string[]; hash?: string };

export interface ViewState {
  view: string;
  params?: ViewParams;
  tag?: string;
  issueNumber?: number;
  issuesTab?: IssuesTab;
  projectId?: string;
  /** the book file read, see reader */
  bookPath?: string;
  /** the place to open the book at, a CFI */
  bookCfi?: string;
  /** a file opened by a plugin, or a view of a plugin, see plugins/ */
  pluginId?: string;
  filePath?: string;
  pluginViewId?: string;
}

export type ViewAction =
  | { view: "default" }
  | { view: "feed" }
  | { view: "chronicle" }
  | { view: "graph" }
  | { view: "journal" }
  | { view: "issues"; tab?: IssuesTab }
  | { view: "issue"; number: number }
  | { view: "project"; projectId?: string }
  | { view: "library" }
  | { view: "vocabulary" }
  | { view: "book"; path: string; cfi?: string }
  | { view: "plugin-file"; plugin: string; path: string }
  | { view: "plugin"; plugin: string; viewId: string }
  | {
      view: "md";
      params: ViewParams;
    }
  | {
      view: "tag";
      tag: string;
    };

/**
 * What goes with a view, outside of its state: the current note, the window
 * title, the explorer hidden. Run on dispatch, not in the reducer: a reducer
 * runs while React renders, where other components must not be updated.
 */
/** The title of the view of a plugin, as its manifest says */
const pluginViewTitle = (plugin: string, viewId: string) =>
  store
    .getState()
    .installedPlugins.find((p) => p.id === plugin)
    ?.manifest?.contributes.views.find((v) => v.id === viewId)?.title ?? viewId;

export function viewEffects(action: ViewAction) {
  const { view } = action;
  if (view === "md") {
    store.getState().setCurrentNoteId(action.params.noteId);
    return;
  }
  store.getState().setCurrentNoteId("");
  if (view === "issue") setWindowTitle(`${issueLabel(action.number)} - mdSilo`);
  else if (view === "plugin-file")
    setWindowTitle(`${action.path.split("/").pop()} - mdSilo`);
  else if (view === "plugin")
    setWindowTitle(`${pluginViewTitle(action.plugin, action.viewId)} - mdSilo`);
  else if (view === "book")
    setWindowTitle(`${action.path.split("/").pop()} - mdSilo`);
  else setWindowTitle(`${view} - mdSilo`);
  // to go back to it from the side menu, or on startup
  if (view === "book") {
    const { initDir, setLastBook } = store.getState();
    if (initDir) setLastBook(initDir, action.path);
  }
  // the books take the room of the note tree
  if (view === "library" || view === "book" || view === "vocabulary")
    store.getState().setIsSidebarOpen(false);
}

export function viewReducer(state: ViewState, action: ViewAction): ViewState {
  const actionView = action.view;
  switch (actionView) {
    case "default":
      return { ...state, view: "default" };
    case "feed":
      return { ...state, view: "feed" };
    case "chronicle":
      return { ...state, view: "chronicle" };
    case "graph":
      return { ...state, view: "graph" };
    case "journal":
      return { ...state, view: "journal" };
    case "issues":
      return {
        view: "issues",
        ...(action.tab ? { issuesTab: action.tab } : {}),
      };
    case "issue":
      return { view: "issue", issueNumber: action.number };
    case "project":
      return { view: "project", projectId: action.projectId };
    case "library":
      return { view: "library" };
    case "vocabulary":
      return { view: "vocabulary" };
    case "book":
      return { view: "book", bookPath: action.path, bookCfi: action.cfi };
    case "plugin":
      return {
        view: "plugin",
        pluginId: action.plugin,
        pluginViewId: action.viewId,
      };
    case "plugin-file":
      return {
        view: "plugin-file",
        pluginId: action.plugin,
        filePath: action.path,
      };
    case "md":
      return { view: "md", params: action.params };
    case "tag":
      return { view: "tag", tag: action.tag };
    default:
      throw new Error();
  }
}
