import {
  PROTOCOL,
  type AnswerMessage,
  type EventMessage,
  type EventName,
  type Events,
  type MethodName,
  type ParamsOf,
  type PluginStyle,
  type RequestMessage,
  type RequestName,
  type Requests,
  type ResultOf,
} from "./protocol";

type Handler<R extends RequestName> = (
  params: Requests[R]["params"],
) => Requests[R]["result"] | Promise<Requests[R]["result"]>;

export type ClientOptions = {
  /** the app: `window.parent` in the page of a plugin */
  target?: Pick<Window, "postMessage">;
  /** where the messages of the app come in: `window` */
  source?: Pick<Window, "addEventListener" | "removeEventListener">;
  /** ms to wait for an answer, none by default */
  timeout?: number;
};

export type Client = {
  /** call a method of the app */
  call<M extends MethodName>(
    method: M,
    ...params: ParamsOf<M> extends void
      ? [params?: ParamsOf<M>]
      : [params: ParamsOf<M>]
  ): Promise<ResultOf<M>>;
  /** listen to an event of the app; gives the function to stop */
  on<E extends EventName>(
    event: E,
    listener: (data: Events[E]) => void,
  ): () => void;
  /** answer what the app asks: code.render, selection.action, command.run */
  handle<R extends RequestName>(request: R, handler: Handler<R>): () => void;
  /** stop listening to the app; calls waiting are rejected */
  close(): void;
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const isMessage = (data: unknown): data is { mdsilo: number } =>
  typeof data === "object" &&
  data !== null &&
  (data as { mdsilo?: unknown }).mdsilo === PROTOCOL;

/**
 * The app, for the page of a plugin:
 *
 * ```js
 * const app = createClient();
 * const text = await app.call("file.read");
 * app.on("file.changed", reload);
 * app.handle("code.render", ({ code }) => `<svg>…</svg>`);
 * ```
 */
export function createClient(options: ClientOptions = {}): Client {
  const target = options.target ?? window.parent;
  const source = options.source ?? window;
  const post = (message: object) =>
    target.postMessage({ mdsilo: PROTOCOL, ...message }, "*");

  let seq = 0;
  const waiting = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (e: Error) => void }
  >();
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const handlers = new Map<string, (params: unknown) => unknown>();

  const onMessage = async (e: Event) => {
    const event = e as MessageEvent;
    // only the app, not a frame of the page itself
    if (event.source && event.source !== (target as unknown)) return;
    const data: unknown = event.data;
    if (!isMessage(data)) return;
    if ("request" in data) {
      const { request, method, params } = data as RequestMessage;
      const handler = handlers.get(method);
      if (!handler) {
        post({ reply: request, error: `Unknown method: ${method}` });
        return;
      }
      try {
        post({ reply: request, result: await handler(params) });
      } catch (e) {
        post({ reply: request, error: errorText(e) });
      }
    } else if ("event" in data) {
      const { event: name, data: value } = data as EventMessage;
      listeners.get(name)?.forEach((listener) => listener(value));
    } else if ("id" in data) {
      const { id, result, error } = data as AnswerMessage;
      const pending = waiting.get(id as number);
      if (!pending) return;
      waiting.delete(id as number);
      if (error !== undefined) pending.reject(new Error(String(error)));
      else pending.resolve(result);
    }
  };
  source.addEventListener("message", onMessage);

  return {
    call: (method, ...[params]) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const done =
          <T>(fn: (value: T) => void) =>
          (value: T) => {
            if (timer) clearTimeout(timer);
            fn(value);
          };
        waiting.set(id, {
          resolve: done(resolve as (value: unknown) => void),
          reject: done(reject),
        });
        if (options.timeout) {
          timer = setTimeout(() => {
            waiting.delete(id);
            reject(new Error(`No answer to ${method}`));
          }, options.timeout);
        }
        post({ id, method, params });
      }),
    on: (event, listener) => {
      const set = listeners.get(event) ?? new Set();
      listeners.set(event, set);
      const fn = listener as (data: unknown) => void;
      set.add(fn);
      return () => set.delete(fn);
    },
    handle: (request, handler) => {
      handlers.set(request, handler as (params: unknown) => unknown);
      return () => handlers.delete(request);
    },
    close: () => {
      source.removeEventListener("message", onMessage);
      for (const pending of waiting.values())
        pending.reject(new Error("The client is closed"));
      waiting.clear();
    },
  };
}

/**
 * Put the variables of the theme of the app on an element (the page by
 * default), with its font and color scheme, to look like the app:
 * `background: var(--color-base-100)`.
 */
export function applyStyle(
  style: PluginStyle,
  element: HTMLElement = document.documentElement,
) {
  for (const [key, value] of Object.entries(style.vars))
    element.style.setProperty(key, value);
  element.style.colorScheme = style.dark ? "dark" : "light";
  element.style.fontFamily = style.font;
  element.dataset.theme = style.theme;
}

/** Follow the look of the app: applied now, and on each change. */
export async function followStyle(
  client: Client,
  element: HTMLElement = document.documentElement,
): Promise<() => void> {
  const stop = client.on("style", (style) => applyStyle(style, element));
  applyStyle(await client.call("app.style"), element);
  return stop;
}
