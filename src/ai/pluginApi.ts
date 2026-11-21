import { complete } from "./client";
import type { ChatMessage } from "./protocol";

/**
 * The AI for plugins (docs/ai.md, "Plugins"): `ai.complete`, with the
 * permission `ai`, by the provider the user set up, counted in their usage.
 * One request of a plugin at a time, a few a minute, text only.
 */

/** requests of a plugin a minute at most */
export const PLUGIN_RATE = 20;
/** characters of the messages of a request at most */
export const PLUGIN_MAX_CHARS = 100_000;

const running = new Set<string>();
const recent = new Map<string, number[]>();

/** For tests: forget the requests made */
export const forgetPluginRequests = () => {
  running.clear();
  recent.clear();
};

type Params = {
  prompt?: unknown;
  system?: unknown;
  messages?: unknown;
  role?: unknown;
  maxTokens?: unknown;
};

/** The messages of the params: `prompt` (and `system`), or `messages`. */
export function messagesOfParams(params: unknown): ChatMessage[] {
  const p = (typeof params === "object" && params ? params : {}) as Params;
  const messages: ChatMessage[] = [];
  if (typeof p.system === "string" && p.system.trim())
    messages.push({ role: "system", content: p.system });
  if (Array.isArray(p.messages)) {
    for (const m of p.messages) {
      const role = (m as { role?: unknown })?.role;
      const content = (m as { content?: unknown })?.content;
      if (
        (role === "system" || role === "user" || role === "assistant") &&
        typeof content === "string"
      )
        messages.push({ role, content });
      else
        throw new Error(
          "ai.complete: each message wants { role: system | user | assistant, content: string }",
        );
    }
  } else if (typeof p.prompt === "string" && p.prompt.trim())
    messages.push({ role: "user", content: p.prompt });
  if (!messages.some((m) => m.role === "user"))
    throw new Error("ai.complete wants { prompt } or { messages }");
  const size = messages.reduce((n, m) => n + m.content.length, 0);
  if (size > PLUGIN_MAX_CHARS)
    throw new Error(`ai.complete: at most ${PLUGIN_MAX_CHARS} characters`);
  return messages;
}

/** Answer a plugin: the text of the model. */
export async function pluginComplete(
  pluginId: string,
  params: unknown,
  now = Date.now(),
): Promise<{ text: string }> {
  const messages = messagesOfParams(params);
  if (running.has(pluginId))
    throw new Error("ai.complete: one request at a time");
  const times = (recent.get(pluginId) ?? []).filter((t) => now - t < 60_000);
  if (times.length >= PLUGIN_RATE)
    throw new Error(`ai.complete: at most ${PLUGIN_RATE} requests a minute`);
  recent.set(pluginId, [...times, now]);
  const p = params as Params;
  running.add(pluginId);
  try {
    const text = await complete({
      messages,
      role: p.role === "fast" ? "fast" : "chat",
      maxTokens:
        typeof p.maxTokens === "number" && p.maxTokens > 0
          ? Math.min(Math.floor(p.maxTokens), 16_000)
          : undefined,
    });
    return { text };
  } finally {
    running.delete(pluginId);
  }
}
