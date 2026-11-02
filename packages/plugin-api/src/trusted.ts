import type {
  EventName,
  Events,
  MethodName,
  ParamsOf,
  RequestName,
  Requests,
  ResultOf,
} from "./protocol";

/**
 * A trusted plugin (`"mode": "trusted"`) is not sandboxed: its `main` is an
 * ES module run in the app itself, with full access to the files of the
 * user. The user is warned before enabling it. The module exports
 * `activate(api)`, or a default function, and may export `deactivate()`:
 *
 * ```js
 * export function activate(api) {
 *   api.handle("code.render", ({ code }) => `<pre>${code}</pre>`);
 *   api.page("main", (el, page) => { el.textContent = "Hello"; });
 *   api.reader.addStyles("p { text-indent: 2em; }");
 * }
 * ```
 */

/** Calls the app, as the client of a sandboxed page does */
export type Caller = {
  call<M extends MethodName>(
    method: M,
    ...params: ParamsOf<M> extends void
      ? [params?: ParamsOf<M>]
      : [params: ParamsOf<M>]
  ): Promise<ResultOf<M>>;
};

/** A page of a trusted plugin shown in the app: a view, a file viewer, a note mode */
export type PageClient = Caller & {
  on<E extends EventName>(
    event: E,
    listener: (data: Events[E]) => void,
  ): () => void;
};

/**
 * Draws a page into `element`, with the methods of where it shows (the file
 * opened, the note open, the workspace); gives what to do when it closes.
 */
export type MountPage = (
  element: HTMLElement,
  page: PageClient,
) => void | (() => void);

export type TrustedApi = Caller & {
  plugin: { id: string; version: string; dir: string };
  /** answers what the app asks, as the main page of a sandboxed plugin */
  handle<R extends RequestName>(
    request: R,
    handler: (
      params: Requests[R]["params"],
    ) => Requests[R]["result"] | Promise<Requests[R]["result"]>,
  ): () => void;
  /**
   * the page named in the manifest (`page` of a view or a note mode), or
   * `main` for a viewer and for those without a `page`
   */
  page(name: string, mount: MountPage): () => void;
  editor: {
    /** the base class of the extensions of the editor (mdsmirror) */
    Extension: new (options?: Record<string, unknown>) => object;
    /** adds an extension to the editor: nodes, marks, ProseMirror plugins, markdown rules */
    addExtension(extension: object): () => void;
  };
  reader: {
    /** CSS for the pages of the books, after the styles of the app */
    addStyles(css: string): () => void;
  };
  /** run when the plugin is disabled, removed or loaded again */
  onUnload(fn: () => void): void;
};

export type TrustedModule = {
  activate?: (api: TrustedApi) => void | Promise<void>;
  default?: (api: TrustedApi) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
};
