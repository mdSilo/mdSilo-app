import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { DEFAULT_AI_SETTINGS } from "@/state/userSettings";
import { chat, complete, listModels, NoProviderError, resolve } from "./client";
import {
  checkedBaseUrl,
  modelFor,
  newProviderId,
  providerFor,
  useAiProviders,
  type AiProvider,
} from "./providers";
import { monthOf, usageOf, withUsage } from "./usage";
import { languageName } from "./translate";
import type { Delta } from "./protocol";

const local: AiProvider = {
  id: "ollama",
  kind: "openai",
  label: "Ollama",
  baseUrl: "http://localhost:11434/v1",
  hasKey: false,
  settings: { chatModel: "llama", fastModel: "" },
};
const claude: AiProvider = {
  id: "anthropic",
  kind: "anthropic",
  label: "Anthropic",
  baseUrl: "https://api.anthropic.com/v1",
  hasKey: true,
  settings: { chatModel: "claude-opus-5-5", fastModel: "claude-haiku-5-5" },
};

type StreamArgs = {
  provider: string;
  path: string;
  body: Record<string, unknown>;
  request: number;
  onEvent: { onmessage: (e: unknown) => void };
};

/** `ai_stream` answering these SSE chunks, as Rust does, the end on the channel. */
function mockStream(chunks: string[], calls: StreamArgs[] = []) {
  vi.mocked(invoke).mockImplementation(async (cmd, args) => {
    if (cmd === "ai_providers") return [local, claude];
    if (cmd === "ai_stream") {
      const a = args as unknown as StreamArgs;
      calls.push(a);
      for (const text of chunks) a.onEvent.onmessage({ type: "text", text });
      a.onEvent.onmessage({ type: "end" });
      return undefined;
    }
    if (cmd === "ai_fetch") return { data: [{ id: "b" }, { id: "a" }] };
    return undefined;
  });
  return calls;
}

beforeEach(() => {
  useAiProviders.setState({ providers: [], loaded: false });
  store.getState().setAiSettings(DEFAULT_AI_SETTINGS);
});

describe("providers", () => {
  test("checkedBaseUrl", () => {
    expect(checkedBaseUrl(" http://localhost:1234/v1/ ")).toBe(
      "http://localhost:1234/v1",
    );
    expect(() => checkedBaseUrl("ftp://a")).toThrow();
    expect(() => checkedBaseUrl("https://a.com/v1?k=1")).toThrow();
    expect(() => checkedBaseUrl("nope")).toThrow();
  });

  test("newProviderId", () => {
    expect(newProviderId("LM Studio", [])).toBe("lm-studio");
    expect(newProviderId("Ollama", ["ollama", "ollama-2"])).toBe("ollama-3");
    expect(newProviderId("!!", [])).toBe("provider");
  });

  test("the provider and model of a role", () => {
    expect(providerFor([local, claude], "anthropic")).toBe(claude);
    expect(providerFor([local, claude], "gone")).toBe(local);
    expect(providerFor([], "")).toBeUndefined();
    expect(modelFor(local, "fast")).toBe("llama");
    expect(modelFor(claude, "fast")).toBe("claude-haiku-5-5");
  });

  test("resolve: by role, else an error saying what to do", async () => {
    mockStream([]);
    store.getState().setAiSettings({
      ...DEFAULT_AI_SETTINGS,
      chatProvider: "ollama",
      fastProvider: "anthropic",
    });
    expect(await resolve({})).toEqual({ provider: local, model: "llama" });
    expect(await resolve({ role: "fast" })).toEqual({
      provider: claude,
      model: "claude-haiku-5-5",
    });
    await expect(
      resolve({ provider: { ...local, settings: {} } }),
    ).rejects.toThrow(/No model/);

    useAiProviders.setState({ providers: [], loaded: true });
    await expect(resolve({})).rejects.toBeInstanceOf(NoProviderError);
  });
});

describe("chat", () => {
  test("streams the answer of Anthropic and counts the tokens", async () => {
    const calls = mockStream([
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel',
      'lo"}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}\n\n',
    ]);
    store
      .getState()
      .setAiSettings({ ...DEFAULT_AI_SETTINGS, chatProvider: "anthropic" });
    const deltas: Delta[] = [];
    for await (const d of chat({
      messages: [
        { role: "system", content: "S" },
        { role: "user", content: "Hi" },
      ],
    }))
      deltas.push(d);
    expect(deltas.filter((d) => d.type === "text")).toEqual([
      { type: "text", text: "Hello" },
    ]);
    expect(calls[0].provider).toBe("anthropic");
    expect(calls[0].path).toBe("/messages");
    expect(calls[0].body.model).toBe("claude-opus-5-5");
    expect(calls[0].body.system).toBe("S");
    expect(usageOf(store.getState().aiSettings)).toEqual({
      input: 12,
      output: 3,
      requests: 1,
    });
  });

  test("complete: the whole text; errors and empty answers throw", async () => {
    mockStream([
      'data: {"choices":[{"delta":{"content":"O"}}]}\n\ndata: {"choices":[{"delta":{"content":"K"}}]}\n\ndata: [DONE]\n\n',
    ]);
    expect(await complete({ messages: [{ role: "user", content: "x" }] })).toBe(
      "OK",
    );

    mockStream(['data: {"error":{"message":"no such model"}}\n\n']);
    await expect(
      complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow("no such model");

    mockStream([
      'data: {"choices":[{"delta":{},"finish_reason":"content_filter"}]}\n\n',
    ]);
    await expect(
      complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/declined/);
  });

  test("a stream that fails rejects", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "ai_providers") return [local];
      if (cmd === "ai_stream") throw "401 Unauthorized: bad key";
      return undefined;
    });
    await expect(
      complete({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow("401 Unauthorized");
  });

  test("canceled: stops at once and tells Rust", async () => {
    let channel: StreamArgs["onEvent"] | undefined;
    vi.mocked(invoke).mockImplementation(async (cmd, args) => {
      if (cmd === "ai_providers") return [local];
      if (cmd === "ai_stream") {
        channel = (args as unknown as StreamArgs).onEvent;
        // never ends by itself
        return new Promise(() => undefined);
      }
      return undefined;
    });
    const controller = new AbortController();
    const texts: string[] = [];
    const done = (async () => {
      for await (const d of chat({
        messages: [{ role: "user", content: "x" }],
        signal: controller.signal,
      }))
        if (d.type === "text") texts.push(d.text);
    })();
    await vi.waitFor(() => expect(channel).toBeDefined());
    channel!.onmessage({
      type: "text",
      text: 'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
    });
    await vi.waitFor(() => expect(texts).toEqual(["A"]));
    controller.abort();
    await done;
    expect(invoke).toHaveBeenCalledWith("ai_cancel", {
      request: expect.any(Number),
    });
  });

  test("listModels", async () => {
    mockStream([]);
    expect(await listModels(local)).toEqual(["a", "b"]);
    expect(invoke).toHaveBeenCalledWith("ai_fetch", {
      provider: "ollama",
      method: "GET",
      path: "/models",
      body: undefined,
    });
  });
});

describe("usage", () => {
  test("added by month and provider, a year kept", () => {
    let s = withUsage(DEFAULT_AI_SETTINGS, "a", 10, 5, "2026-01");
    s = withUsage(s, "a", 1, 1, "2026-01");
    s = withUsage(s, "b", 2, 2, "2026-01");
    expect(s.usage["2026-01"].a).toEqual({ input: 11, output: 6, requests: 2 });
    expect(usageOf(s, "2026-01")).toEqual({
      input: 13,
      output: 8,
      requests: 3,
    });
    for (let m = 2; m <= 13; m++) {
      const month = m <= 12 ? `2026-${String(m).padStart(2, "0")}` : "2027-01";
      s = withUsage(s, "a", 1, 1, month);
    }
    expect(Object.keys(s.usage)).toHaveLength(12);
    expect(s.usage["2026-01"]).toBeUndefined();
    expect(monthOf(new Date(2026, 10, 20))).toBe("2026-11");
  });
});

test("languageName", () => {
  expect(languageName("fr")).toBe("French");
  expect(languageName("zh-CN")).toMatch(/Chinese/);
  expect(languageName("")).toBe("");
});
