import {
  ANTHROPIC_MAX_TOKENS,
  chatRequest,
  deltasOf,
  modelsOf,
  SseParser,
  stopMessage,
  type ChatMessage,
} from "./protocol";

const messages: ChatMessage[] = [
  { role: "system", content: "Be brief." },
  { role: "user", content: "Hi" },
  { role: "assistant", content: "Hello" },
  { role: "user", content: "Again" },
];

describe("chatRequest", () => {
  test("OpenAI-compatible: messages as they are, usage asked", () => {
    const { path, body } = chatRequest("openai", messages, { model: "m" });
    expect(path).toBe("/chat/completions");
    expect(body).toEqual({
      model: "m",
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(
      chatRequest("openai", messages, { model: "m", maxTokens: 10 }).body
        .max_tokens,
    ).toBe(10);
  });

  test("Anthropic: the system prompt apart, max tokens always", () => {
    const { path, body } = chatRequest("anthropic", messages, { model: "c" });
    expect(path).toBe("/messages");
    expect(body).toEqual({
      model: "c",
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: "Be brief.",
      messages: messages.slice(1),
      stream: true,
    });
    const noSystem = chatRequest("anthropic", messages.slice(1), {
      model: "c",
      maxTokens: 5,
    }).body;
    expect(noSystem.system).toBeUndefined();
    expect(noSystem.max_tokens).toBe(5);
  });
});

describe("SseParser", () => {
  test("events cut anywhere between chunks", () => {
    const stream =
      'event: a\ndata: {"x":1}\n\n: comment\ndata: line1\ndata: line2\r\n\r\ndata: last';
    const parser = new SseParser();
    const events = [];
    for (let i = 0; i < stream.length; i += 3)
      events.push(...parser.push(stream.slice(i, i + 3)));
    events.push(...parser.end());
    expect(events).toEqual([
      { event: "a", data: '{"x":1}' },
      { event: "message", data: "line1\nline2" },
      { event: "message", data: "last" },
    ]);
    expect(parser.end()).toEqual([]);
  });
});

const event = (data: unknown) => ({
  event: "message",
  data: typeof data === "string" ? data : JSON.stringify(data),
});

describe("deltasOf", () => {
  test("OpenAI-compatible", () => {
    expect(
      deltasOf("openai", event({ choices: [{ delta: { content: "Hi" } }] })),
    ).toEqual([{ type: "text", text: "Hi" }]);
    expect(
      deltasOf(
        "openai",
        event({ choices: [{ delta: {}, finish_reason: "length" }] }),
      ),
    ).toEqual([{ type: "stop", reason: "length" }]);
    expect(
      deltasOf(
        "openai",
        event({
          choices: [],
          usage: { prompt_tokens: 3, completion_tokens: 4 },
        }),
      ),
    ).toEqual([{ type: "usage", input: 3, output: 4 }]);
    expect(deltasOf("openai", event("[DONE]"))).toEqual([]);
    expect(deltasOf("openai", event("not json"))).toEqual([]);
    expect(
      deltasOf("openai", event({ error: { message: "bad key" } })),
    ).toEqual([{ type: "error", message: "bad key" }]);
  });

  test("Anthropic", () => {
    expect(
      deltasOf(
        "anthropic",
        event({
          type: "message_start",
          message: {
            usage: {
              input_tokens: 5,
              cache_read_input_tokens: 10,
              cache_creation_input_tokens: 1,
            },
          },
        }),
      ),
    ).toEqual([{ type: "usage", input: 16 }]);
    expect(
      deltasOf(
        "anthropic",
        event({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Yo" },
        }),
      ),
    ).toEqual([{ type: "text", text: "Yo" }]);
    // thinking is not shown
    expect(
      deltasOf(
        "anthropic",
        event({
          type: "content_block_delta",
          delta: { type: "thinking_delta", thinking: "hmm" },
        }),
      ),
    ).toEqual([]);
    expect(
      deltasOf(
        "anthropic",
        event({
          type: "message_delta",
          delta: { stop_reason: "refusal" },
          usage: { output_tokens: 7 },
        }),
      ),
    ).toEqual([
      { type: "usage", output: 7 },
      { type: "stop", reason: "refusal" },
    ]);
    expect(
      deltasOf(
        "anthropic",
        event({
          type: "error",
          error: { type: "overloaded_error", message: "Overloaded" },
        }),
      ),
    ).toEqual([{ type: "error", message: "Overloaded" }]);
  });
});

test("modelsOf", () => {
  expect(modelsOf({ data: [{ id: "b" }, { id: "a" }, { id: 1 }, {}] })).toEqual(
    ["a", "b"],
  );
  expect(modelsOf(null)).toEqual([]);
  expect(modelsOf({ models: [] })).toEqual([]);
});

test("stopMessage", () => {
  expect(stopMessage("end_turn")).toBeNull();
  expect(stopMessage("stop")).toBeNull();
  expect(stopMessage("max_tokens")).toMatch(/cut/);
  expect(stopMessage("length")).toMatch(/cut/);
  expect(stopMessage("refusal")).toMatch(/declined/);
});
