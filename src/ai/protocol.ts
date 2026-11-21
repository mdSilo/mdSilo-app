/**
 * The APIs of the AI providers (B6, see docs/ai.md): the requests to make and
 * how to read their answers, streamed as server-sent events. Only what the
 * kinds of provider share is used here, one interface for all:
 *
 * - `openai`: the OpenAI-compatible chat API (`/chat/completions`), served by
 *   OpenAI and most others: Ollama, LM Studio, llama.cpp, OpenRouter…
 * - `anthropic`: Anthropic's Messages API (`/messages`).
 *
 * The same on desktop and web; only the sending differs, see transport.ts.
 */

export type ProviderKind = "openai" | "anthropic";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = { role: ChatRole; content: string };

export type ChatOptions = {
  model: string;
  /** the most tokens of the answer; as the provider says if not given (OpenAI-compatible) */
  maxTokens?: number;
};

/** A part of an answer, as it comes. */
export type Delta =
  | { type: "text"; text: string }
  | { type: "usage"; input?: number; output?: number }
  | { type: "stop"; reason: string }
  | { type: "error"; message: string };

export type Request = { path: string; body: Record<string, unknown> };

/** the most tokens of an answer of Anthropic, which needs one */
export const ANTHROPIC_MAX_TOKENS = 16000;

/** The request of a chat, streamed. */
export function chatRequest(
  kind: ProviderKind,
  messages: ChatMessage[],
  { model, maxTokens }: ChatOptions,
): Request {
  if (kind === "anthropic") {
    // the system prompt is apart; consecutive messages of a role are one turn
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens || ANTHROPIC_MAX_TOKENS,
      messages: messages
        .filter((m) => m.role !== "system")
        .map(({ role, content }) => ({ role, content })),
      stream: true,
    };
    if (system) body.system = system;
    return { path: "/messages", body };
  }
  const body: Record<string, unknown> = {
    model,
    messages: messages.map(({ role, content }) => ({ role, content })),
    stream: true,
    stream_options: { include_usage: true },
  };
  if (maxTokens) body.max_tokens = maxTokens;
  return { path: "/chat/completions", body };
}

/** The path listing the models, the same for both kinds: `{ data: [{ id }] }`. */
export const MODELS_PATH = "/models";

/** The ids of the models in the answer of `MODELS_PATH`, sorted. */
export function modelsOf(answer: unknown): string[] {
  const data = (answer as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => (m as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

export type SseEvent = { event: string; data: string };

/**
 * Server-sent events out of a stream of text, which can cut an event (or a
 * line) anywhere between two chunks.
 */
export class SseParser {
  private rest = "";

  /** The events whole in the text so far. */
  push(text: string): SseEvent[] {
    this.rest += text;
    const events: SseEvent[] = [];
    for (;;) {
      const match = /\r?\n\r?\n/.exec(this.rest);
      if (!match) break;
      const block = this.rest.slice(0, match.index);
      this.rest = this.rest.slice(match.index + match[0].length);
      const event = parseBlock(block);
      if (event) events.push(event);
    }
    return events;
  }

  /** The last event, when the stream ends without a blank line. */
  end(): SseEvent[] {
    const block = this.rest;
    this.rest = "";
    const event = parseBlock(block);
    return event ? [event] : [];
  }
}

function parseBlock(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The parts of an answer in an event. */
export function deltasOf(kind: ProviderKind, { data }: SseEvent): Delta[] {
  if (data === "[DONE]") return [];
  let json: any;
  try {
    json = JSON.parse(data);
  } catch {
    return [];
  }
  if (!json || typeof json !== "object") return [];
  if (json.error) {
    const message =
      typeof json.error === "string"
        ? json.error
        : (json.error.message ?? JSON.stringify(json.error));
    return [{ type: "error", message: String(message) }];
  }
  return kind === "anthropic" ? anthropicDeltas(json) : openaiDeltas(json);
}

function anthropicDeltas(json: any): Delta[] {
  switch (json.type) {
    case "message_start": {
      const usage = json.message?.usage;
      if (!usage) return [];
      // all the input: the tokens read from the cache and written to it too
      const input =
        (usage.input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0);
      return [{ type: "usage", input }];
    }
    case "content_block_delta":
      // thinking and the inputs of tools are not shown
      return json.delta?.type === "text_delta" && json.delta.text
        ? [{ type: "text", text: json.delta.text }]
        : [];
    case "message_delta": {
      const deltas: Delta[] = [];
      if (typeof json.usage?.output_tokens === "number")
        deltas.push({ type: "usage", output: json.usage.output_tokens });
      if (json.delta?.stop_reason)
        deltas.push({ type: "stop", reason: json.delta.stop_reason });
      return deltas;
    }
    default:
      return [];
  }
}

function openaiDeltas(json: any): Delta[] {
  const deltas: Delta[] = [];
  const choice = Array.isArray(json.choices) ? json.choices[0] : undefined;
  const text = choice?.delta?.content;
  if (typeof text === "string" && text) deltas.push({ type: "text", text });
  if (choice?.finish_reason)
    deltas.push({ type: "stop", reason: choice.finish_reason });
  if (json.usage && typeof json.usage === "object") {
    deltas.push({
      type: "usage",
      input: json.usage.prompt_tokens,
      output: json.usage.completion_tokens,
    });
  }
  return deltas;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Why an answer stopped, said to the user when it is not the end of it. */
export function stopMessage(reason: string): string | null {
  switch (reason) {
    case "end_turn":
    case "stop":
    case "stop_sequence":
    case "tool_use":
    case "tool_calls":
      return null;
    case "max_tokens":
    case "length":
      return "The answer was cut: it reached the most tokens allowed.";
    case "refusal":
    case "content_filter":
      return "The model declined to answer.";
    default:
      return null;
  }
}
