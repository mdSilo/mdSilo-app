import { Channel, invoke } from "@tauri-apps/api/core";
import { isWeb } from "@/workspace/util";

/**
 * Sending a request to an AI provider, by its id. On desktop Rust sends it
 * with the key of the provider (src-tauri/src/ai), which the frontend never
 * sees; on web the browser sends it, the key kept in IndexedDB.
 */

type StreamEvent = { type: "text"; text: string } | { type: "end" };

const ANTHROPIC_VERSION = "2023-06-01";

let lastRequest = 0;

/** The text of a streamed answer, as it comes, until its end or `signal`. */
export function streamText(
  provider: string,
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  return isWeb
    ? webStream(provider, path, body, signal)
    : desktopStream(provider, path, body, signal);
}

/** A request answered in JSON, e.g. the models of the provider. */
export async function fetchJson(
  provider: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<unknown> {
  if (!isWeb) return invoke("ai_fetch", { provider, method, path, body });
  const response = await webFetch(provider, method, path, body);
  return response.json();
}

async function* desktopStream(
  provider: string,
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  if (signal?.aborted) return;
  const request = ++lastRequest;
  const queue: string[] = [];
  let ended = false;
  let error: unknown;
  let wake: (() => void) | null = null;
  const notify = () => {
    const w = wake;
    wake = null;
    w?.();
  };
  const channel = new Channel<StreamEvent>();
  channel.onmessage = (event) => {
    if (event.type === "text") queue.push(event.text);
    else ended = true;
    notify();
  };
  invoke("ai_stream", { provider, path, body, request, onEvent: channel }).then(
    undefined,
    (e: unknown) => {
      error = e;
      notify();
    },
  );
  const onAbort = () => {
    void invoke("ai_cancel", { request });
    notify();
  };
  signal?.addEventListener("abort", onAbort);
  try {
    for (;;) {
      if (signal?.aborted) return;
      const text = queue.shift();
      if (text !== undefined) {
        yield text;
        continue;
      }
      if (error !== undefined)
        throw error instanceof Error ? error : new Error(String(error));
      if (ended) return;
      await new Promise<void>((resolve) => (wake = resolve));
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

async function webFetch(
  id: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const { storedProvider } = await import("@/host/web/ai");
  const provider = await storedProvider(id);
  if (!path.startsWith("/") || path.includes("//") || path.includes(".."))
    throw new Error(`Bad path ${path}`);
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (provider.kind === "anthropic") {
    headers["anthropic-version"] = ANTHROPIC_VERSION;
    // Anthropic answers a browser only if asked so
    headers["anthropic-dangerous-direct-browser-access"] = "true";
    if (provider.key) headers["x-api-key"] = provider.key;
  } else if (provider.key) {
    // Brave wants its key in a header of its own
    if (
      provider.kind === "search" &&
      (provider.settings as { service?: string }).service === "brave"
    )
      headers["x-subscription-token"] = provider.key;
    else headers.authorization = `Bearer ${provider.key}`;
  }
  let response: Response;
  try {
    response = await fetch(`${provider.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new Error(
      `${provider.label} cannot be reached from the browser: ${String(e)}. A server on this computer must allow this site (e.g. OLLAMA_ORIGINS for Ollama); some services do not answer browsers.`,
      { cause: e },
    );
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status}: ${text.slice(0, 500)}`);
  }
  return response;
}

async function* webStream(
  provider: string,
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let response: Response;
  try {
    response = await webFetch(provider, "POST", path, body, signal);
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return;
    throw e;
  }
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const rest = decoder.decode();
    if (rest) yield rest;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return;
    throw e;
  } finally {
    reader.releaseLock();
  }
}
