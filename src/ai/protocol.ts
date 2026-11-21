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

/** A tool the model may call: its input as a JSON schema. */
export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/** A call of a tool asked by the model; `input` none if not valid JSON. */
export type ToolCall = {
  id: string;
  name: string;
  input?: Record<string, unknown>;
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string;
      /** the tools it called */
      toolCalls?: ToolCall[];
      /** the answer as the provider gave it, sent back as it is (Anthropic: its thinking too) */
      raw?: unknown;
    }
  | { role: "tool"; toolCallId: string; content: string };

export type ChatOptions = {
  model: string;
  /** the most tokens of the answer; as the provider says if not given (OpenAI-compatible) */
  maxTokens?: number;
  tools?: ToolSpec[];
};

/** A part of an answer, as it comes. */
export type Delta =
  | { type: "text"; text: string }
  | { type: "usage"; input?: number; output?: number }
  | { type: "stop"; reason: string }
  | { type: "error"; message: string }
  /** the end of the answer: the tools it calls, and the answer to send back with their results */
  | { type: "turn"; toolCalls: ToolCall[]; raw?: unknown };

export type Request = { path: string; body: Record<string, unknown> };

/** the most tokens of an answer of Anthropic, which needs one */
export const ANTHROPIC_MAX_TOKENS = 16000;

/* eslint-disable @typescript-eslint/no-explicit-any */
/** An answer that called tools, as Anthropic wants it back: its blocks. */
function anthropicAssistant(m: Extract<ChatMessage, { role: "assistant" }>) {
  if (Array.isArray(m.raw)) return m.raw;
  if (!m.toolCalls?.length) return m.content;
  return [
    ...(m.content ? [{ type: "text", text: m.content }] : []),
    ...m.toolCalls.map((c) => ({
      type: "tool_use",
      id: c.id,
      name: c.name,
      input: c.input ?? {},
    })),
  ];
}

function anthropicMessages(messages: ChatMessage[]) {
  const out: any[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      const result = {
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content: m.content,
      };
      // the results of the calls of an answer: one message
      const last = out[out.length - 1];
      if (last?.role === "user" && Array.isArray(last.content))
        last.content.push(result);
      else out.push({ role: "user", content: [result] });
    } else if (m.role === "assistant")
      out.push({ role: "assistant", content: anthropicAssistant(m) });
    else out.push({ role: "user", content: m.content });
  }
  return out;
}

function openaiMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.role === "tool")
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    if (m.role === "assistant" && m.toolCalls?.length)
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
        })),
      };
    return { role: m.role, content: m.content };
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The request of a chat, streamed. */
export function chatRequest(
  kind: ProviderKind,
  messages: ChatMessage[],
  { model, maxTokens, tools }: ChatOptions,
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
      messages: anthropicMessages(messages),
      stream: true,
    };
    if (system) body.system = system;
    if (tools?.length)
      body.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    return { path: "/messages", body };
  }
  const body: Record<string, unknown> = {
    model,
    messages: openaiMessages(messages),
    stream: true,
    stream_options: { include_usage: true },
  };
  if (maxTokens) body.max_tokens = maxTokens;
  if (tools?.length)
    body.tools = tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
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

/* eslint-disable @typescript-eslint/no-explicit-any */
const parse = (data: string): any => {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
};

const parseInput = (json: string): Record<string, unknown> | undefined => {
  if (!json.trim()) return {};
  const value = parse(json);
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
};

/**
 * What an answer streamed adds up to, besides its text: the tools it calls,
 * and (Anthropic) its blocks, to send back as they were: thinking included,
 * which the API wants back unchanged with the results of the tools.
 */
export class TurnReader {
  private blocks: any[] = [];
  private inputs: string[] = [];
  private calls: { id: string; name: string; args: string }[] = [];

  constructor(private kind: ProviderKind) {}

  /** The parts of the answer in an event, read for the turn too. */
  push(event: SseEvent): Delta[] {
    const json = parse(event.data);
    if (json && typeof json === "object" && !json.error) {
      if (this.kind === "anthropic") this.anthropic(json);
      else this.openai(json);
    }
    return deltasOf(this.kind, event);
  }

  private anthropic(json: any) {
    const i = json.index;
    if (json.type === "content_block_start" && typeof i === "number") {
      this.blocks[i] = { ...json.content_block };
      this.inputs[i] = "";
    } else if (json.type === "content_block_delta" && this.blocks[i]) {
      const block = this.blocks[i];
      const d = json.delta ?? {};
      if (d.type === "text_delta") block.text = (block.text ?? "") + d.text;
      else if (d.type === "thinking_delta")
        block.thinking = (block.thinking ?? "") + d.thinking;
      else if (d.type === "signature_delta") block.signature = d.signature;
      else if (d.type === "input_json_delta")
        this.inputs[i] += d.partial_json ?? "";
    } else if (json.type === "content_block_stop" && this.blocks[i]) {
      const block = this.blocks[i];
      if (block.type === "tool_use") block.input = parseInput(this.inputs[i]);
    }
  }

  private openai(json: any) {
    const calls = json.choices?.[0]?.delta?.tool_calls;
    if (!Array.isArray(calls)) return;
    for (const c of calls) {
      const i = typeof c.index === "number" ? c.index : this.calls.length;
      const call = (this.calls[i] ??= { id: "", name: "", args: "" });
      if (c.id) call.id = c.id;
      if (c.function?.name) call.name += c.function.name;
      if (c.function?.arguments) call.args += c.function.arguments;
    }
  }

  /** The tools called, and the answer to send back with their results. */
  finish(): Extract<Delta, { type: "turn" }> {
    if (this.kind === "anthropic") {
      const blocks = this.blocks.filter(Boolean);
      const toolCalls = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, input: b.input ?? undefined }));
      return {
        type: "turn",
        toolCalls,
        // a tool_use of input not valid: sent back as an empty one
        raw: blocks.map((b) =>
          b.type === "tool_use" && !b.input ? { ...b, input: {} } : b,
        ),
      };
    }
    return {
      type: "turn",
      toolCalls: this.calls
        .filter((c) => c.name)
        .map((c, i) => ({
          id: c.id || `call_${i}`,
          name: c.name,
          input: parseInput(c.args),
        })),
    };
  }
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
