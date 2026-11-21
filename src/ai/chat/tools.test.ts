import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { DEFAULT_AI_SETTINGS } from "@/state/userSettings";
import { defaultNote } from "@/types/model";
import { chatRequest, TurnReader, type ChatMessage } from "../protocol";
import { useAiProviders, type AiProvider } from "../providers";
import { contextOf, scopesFor, toolScopeOf } from "./context";
import { isExcludedPath, saysNoAi } from "./privacy";
import { messagesOf } from "./prompt";
import { bestOf, runTool, scoreOf, termsOf, toolsFor } from "./tools";
import { newChat, sendMessage, useChat, MAX_ROUNDS } from "./chatStore";

// the files of the books, by their hash
vi.mock("@/reader/library/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/reader/library/library")>()),
  findBookPath: async (_ws: string, hash: string) =>
    hash.startsWith("b") ? "/ws/private/b.epub" : "/ws/reading/a.epub",
}));

const note = (
  id: string,
  title: string,
  content: string,
  updated = "2026-01-01",
) =>
  store.getState().upsertNote({
    ...defaultNote,
    id,
    title,
    file_path: id,
    content,
    updated_at: updated,
  });

beforeEach(() => {
  store.getState().setInitDir("/ws");
  store.getState().setAiSettings(DEFAULT_AI_SETTINGS);
});

describe("protocol: tools", () => {
  const tools = [
    { name: "search", description: "Find", parameters: { type: "object" } },
  ];
  const messages: ChatMessage[] = [
    { role: "system", content: "S" },
    { role: "user", content: "Q" },
    {
      role: "assistant",
      content: "Looking",
      toolCalls: [{ id: "c1", name: "search", input: { query: "x" } }],
    },
    { role: "tool", toolCallId: "c1", content: "[1] found" },
  ];

  test("OpenAI-compatible: functions, calls and their results", () => {
    const { body } = chatRequest("openai", messages, { model: "m", tools });
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "search",
          description: "Find",
          parameters: { type: "object" },
        },
      },
    ]);
    expect((body.messages as unknown[]).slice(2)).toEqual([
      {
        role: "assistant",
        content: "Looking",
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: { name: "search", arguments: '{"query":"x"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "c1", content: "[1] found" },
    ]);
  });

  test("Anthropic: the blocks of the answer sent back, the results in one user message", () => {
    const raw = [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "tool_use", id: "c1", name: "search", input: { query: "x" } },
      { type: "tool_use", id: "c2", name: "list", input: {} },
    ];
    const { body } = chatRequest(
      "anthropic",
      [
        ...messages.slice(0, 2),
        { role: "assistant", content: "", toolCalls: [], raw },
        { role: "tool", toolCallId: "c1", content: "a" },
        { role: "tool", toolCallId: "c2", content: "b" },
      ],
      { model: "c", tools },
    );
    expect(body.tools).toEqual([
      { name: "search", description: "Find", input_schema: { type: "object" } },
    ]);
    expect(body.messages).toEqual([
      { role: "user", content: "Q" },
      { role: "assistant", content: raw },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "c1", content: "a" },
          { type: "tool_result", tool_use_id: "c2", content: "b" },
        ],
      },
    ]);
  });

  const ev = (data: unknown) => ({
    event: "message",
    data: JSON.stringify(data),
  });

  test("TurnReader: Anthropic's thinking, text and tool calls, as streamed", () => {
    const turn = new TurnReader("anthropic");
    for (const e of [
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking", thinking: "" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "Hm" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "signature_delta", signature: "S1" },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "content_block_start",
        index: 1,
        content_block: { type: "text", text: "" },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "text_delta", text: "Let me look." },
      },
      { type: "content_block_stop", index: 1 },
      {
        type: "content_block_start",
        index: 2,
        content_block: {
          type: "tool_use",
          id: "t1",
          name: "search",
          input: {},
        },
      },
      {
        type: "content_block_delta",
        index: 2,
        delta: { type: "input_json_delta", partial_json: '{"que' },
      },
      {
        type: "content_block_delta",
        index: 2,
        delta: { type: "input_json_delta", partial_json: 'ry":"fox"}' },
      },
      { type: "content_block_stop", index: 2 },
      {
        type: "content_block_start",
        index: 3,
        content_block: { type: "tool_use", id: "t2", name: "read", input: {} },
      },
      {
        type: "content_block_delta",
        index: 3,
        delta: { type: "input_json_delta", partial_json: '{"bad' },
      },
      { type: "content_block_stop", index: 3 },
    ])
      turn.push(ev(e));
    const { toolCalls, raw } = turn.finish();
    expect(toolCalls).toEqual([
      { id: "t1", name: "search", input: { query: "fox" } },
      { id: "t2", name: "read", input: undefined },
    ]);
    expect(raw).toEqual([
      { type: "thinking", thinking: "Hm", signature: "S1" },
      { type: "text", text: "Let me look." },
      { type: "tool_use", id: "t1", name: "search", input: { query: "fox" } },
      { type: "tool_use", id: "t2", name: "read", input: {} },
    ]);
  });

  test("TurnReader: OpenAI's calls in pieces", () => {
    const turn = new TurnReader("openai");
    for (const e of [
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "a", function: { name: "sea", arguments: "" } },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, function: { name: "rch", arguments: '{"query":' } },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, function: { arguments: '"x"}' } },
                { index: 1, function: { name: "list" } },
              ],
            },
          },
        ],
      },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ])
      turn.push(ev(e));
    expect(turn.finish().toolCalls).toEqual([
      { id: "a", name: "search", input: { query: "x" } },
      { id: "call_1", name: "list", input: {} },
    ]);
  });
});

describe("tools", () => {
  test("terms, scores, the best passages", () => {
    expect(termsOf("The Quick, fox!")).toEqual(["the", "quick", "fox"]);
    expect(termsOf("红楼梦")).toEqual(["红楼梦", "红楼", "楼梦"]);
    expect(
      scoreOf("A quick brown fox", ["quick", "fox", "dog"]),
    ).toBeGreaterThan(scoreOf("A fox", ["quick", "fox", "dog"]));
    const c = (text: string, score: number) => ({
      chunk: { text, href: "h" },
      score,
    });
    expect(
      bestOf([c("a", 1), c("bb", 3), c("zero", 0), c("ccc", 2)], 2).map(
        (x) => x.text,
      ),
    ).toEqual(["bb", "ccc"]);
    expect(
      bestOf([c("x".repeat(10), 5), c("y", 1)], 5, 5).map((x) => x.text),
    ).toEqual([]);
  });

  test("search, read and list the notes of a folder; numbered on; excluded ones never", async () => {
    note("/ws/a/one.md", "One", "Intro\n\nThe fox jumps.", "2026-02-01");
    note("/ws/a/two.md", "Two", "---\nai: false\n---\nThe fox is secret.");
    note(
      "/ws/a/three.md",
      "Three",
      "Nothing here.\n\nA fox again.",
      "2026-03-01",
    );
    note("/ws/b/out.md", "Out", "A fox elsewhere.");
    note("/ws/a/private/p.md", "P", "The fox in private.");
    store
      .getState()
      .setAiSettings({ ...DEFAULT_AI_SETTINGS, excluded: ["a/private"] });
    vi.mocked(invoke).mockImplementation(async (cmd) =>
      cmd === "index_search"
        ? [
            "/ws/a/one.md",
            "/ws/a/two.md",
            "/ws/b/out.md",
            "/ws/a/private/p.md",
            "/ws/a/three.md",
          ].map((path) => ({ id: path, path, kind: "note" }))
        : undefined,
    );
    const scope = toolScopeOf("folder", "/ws/a")!;
    const found = await runTool(
      { id: "1", name: "search", input: { query: "fox" } },
      scope,
      4,
    );
    expect(found.chunks.map((c) => c.text).sort()).toEqual([
      "A fox again.",
      "The fox jumps.",
    ]);
    expect(found.text).toMatch(/^\[4\] /);
    expect(found.text).toContain("[5] ");
    expect(found.step).toBe("search: fox");

    const read = await runTool(
      { id: "2", name: "read", input: { title: "one" } },
      scope,
      1,
    );
    expect(read.text).toBe("One:\n\n[1] Intro\n\n[2] The fox jumps.");
    expect(read.chunks[0].href).toBe("One");
    const secret = await runTool(
      { id: "3", name: "read", input: { title: "Two" } },
      scope,
      1,
    );
    expect(secret.text).toBe("Error: This note is excluded from AI.");

    const list = await runTool({ id: "4", name: "list", input: {} }, scope, 1);
    expect(list.text).toBe("- Three\n- One\n- Two");

    const all = await runTool(
      { id: "5", name: "search", input: { query: "fox" } },
      toolScopeOf("all")!,
      1,
    );
    expect(all.chunks.map((c) => c.text)).toContain("A fox elsewhere.");
    expect(all.chunks.map((c) => c.text)).not.toContain("The fox in private.");

    expect(
      (await runTool({ id: "6", name: "nope", input: {} }, scope, 1)).text,
    ).toBe("Error: No tool nope.");
    expect((await runTool({ id: "7", name: "search" }, scope, 1)).text).toMatch(
      /not valid JSON/,
    );
  });

  test("the book: no book open is said so", async () => {
    const r = await runTool(
      { id: "1", name: "list", input: {} },
      { kind: "book" },
      1,
    );
    expect(r.text).toBe("Error: No book is open in the reader.");
    expect(toolsFor({ kind: "book" }).map((t) => t.name)).toEqual([
      "search",
      "read",
      "list",
    ]);
  });
});

describe("privacy and scopes", () => {
  test("ai: false, excluded folders", async () => {
    expect(saysNoAi("---\ntitle: x\nai: false\n---\nbody")).toBe(true);
    expect(saysNoAi("---\nai: true\n---\n")).toBe(false);
    expect(saysNoAi("ai: false")).toBe(false);
    store
      .getState()
      .setAiSettings({ ...DEFAULT_AI_SETTINGS, excluded: ["/journal/", " "] });
    expect(isExcludedPath("/ws/journal/d.md")).toBe(true);
    expect(isExcludedPath("/ws/journals/d.md")).toBe(false);

    note("/ws/s.md", "Secret", "---\nai: false\n---\nHidden");
    const ctx = await contextOf("auto", {
      view: "md",
      params: { noteId: "/ws/s.md" },
    });
    expect(ctx).toEqual({
      label: "Secret (excluded from AI)",
      chunks: [],
      partial: false,
    });
    expect(messagesOf([], ctx)[0].content).toContain("you may not read it");
  });

  test("the scopes a view allows", () => {
    expect(scopesFor({ view: "md", params: { noteId: "/ws/a.md" } })).toEqual([
      "auto",
      "folder",
      "all",
      "none",
    ]);
    expect(scopesFor({ view: "book" })).toEqual([
      "auto",
      "book",
      "all",
      "none",
    ]);
    store.getState().setInitDir(undefined);
    expect(scopesFor({ view: "chronicle" })).toEqual(["auto", "none"]);
  });
});

describe("the tool loop", () => {
  const provider: AiProvider = {
    id: "p",
    kind: "openai",
    label: "P",
    baseUrl: "http://localhost:1/v1",
    hasKey: false,
    settings: { chatModel: "m" },
  };
  type StreamArgs = {
    body: Record<string, unknown> & { messages: Record<string, unknown>[] };
    onEvent: { onmessage: (e: unknown) => void };
  };
  const sse = (data: unknown) => ({
    type: "text",
    text: `data: ${JSON.stringify(data)}\n\n`,
  });
  const callOf = (name: string, args: unknown, id = "c1") =>
    sse({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
  const say = (text: string) =>
    sse({ choices: [{ delta: { content: text } }] });

  /** each request answered by the next list of events */
  function mockRounds(
    rounds: unknown[][],
    fail?: (body: StreamArgs["body"]) => string | undefined,
  ) {
    const bodies: StreamArgs["body"][] = [];
    vi.mocked(invoke).mockImplementation(async (cmd, args) => {
      if (cmd === "ai_providers") return [provider];
      if (cmd === "index_search")
        return [{ id: "/ws/n.md", path: "/ws/n.md", kind: "note" }];
      if (cmd === "ai_stream") {
        const s = args as unknown as StreamArgs;
        bodies.push(structuredClone(s.body));
        const error = fail?.(s.body);
        if (error) throw error;
        for (const e of rounds[bodies.length - 1] ?? [say("…")])
          s.onEvent.onmessage(e);
        s.onEvent.onmessage({ type: "end" });
      }
      return undefined;
    });
    return bodies;
  }

  beforeEach(() => {
    newChat();
    useAiProviders.setState({ providers: [], loaded: false });
    store.getState().setInitDir(undefined); // not kept: no workspace
    note("/ws/n.md", "N", "Foxes are red.\n\nDogs bark.");
  });

  test("searches, then answers citing what it found", async () => {
    store.getState().setInitDir("/ws");
    useChat.setState({ scope: "all" });
    const bodies = mockRounds([
      [say("Looking."), callOf("search", { query: "fox" })],
      [say("They are red [1].")],
    ]);
    store.getState().setInitDir(undefined);
    await sendMessage("What color are foxes?", undefined);
    expect(bodies).toHaveLength(2);
    expect((bodies[0].tools as unknown[]).length).toBe(3);
    expect(bodies[0].messages[0].content).toContain(
      "You can look up all the user's notes",
    );
    const second = bodies[1].messages;
    expect(second.at(-2)).toMatchObject({
      role: "assistant",
      content: "Looking.",
    });
    expect(second.at(-1)).toEqual({
      role: "tool",
      tool_call_id: "c1",
      content: "[1] Foxes are red.",
    });
    const answer = useChat.getState().messages[1];
    expect(answer).toMatchObject({
      text: "Looking.\n\nThey are red [1].",
      steps: ["search: fox"],
      streaming: false,
    });
    expect(answer.sources).toEqual([{ text: "Foxes are red.", href: "N" }]);
  });

  test("stops looking up after the rounds allowed, and answers", async () => {
    store.getState().setInitDir("/ws");
    useChat.setState({ scope: "all" });
    const rounds = Array.from({ length: MAX_ROUNDS + 1 }, (_, i) => [
      callOf("list", {}, `c${i}`),
    ]);
    const bodies = mockRounds(rounds);
    await sendMessage("Go", undefined);
    expect(bodies).toHaveLength(MAX_ROUNDS + 1);
    expect(String(bodies[MAX_ROUNDS].messages.at(-1)?.content)).toContain(
      "answer now",
    );
    expect(useChat.getState().messages[1].steps).toHaveLength(MAX_ROUNDS);
  });

  test("a provider refusing tools: one search with the question, sent at first", async () => {
    store.getState().setInitDir("/ws");
    useChat.setState({ scope: "all" });
    const bodies = mockRounds([[], [say("Red [1].")]], (body) =>
      body.tools ? "400 Bad Request: tools are not supported" : undefined,
    );
    await sendMessage("fox color", undefined);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].tools).toBeUndefined();
    expect(bodies[1].messages[0].content).toContain("[1] Foxes are red.");
    expect(useChat.getState().messages[1]).toMatchObject({
      text: "Red [1].",
      error: undefined,
    });
  });

  test("tools turned off for the provider: the search at first, no tools", async () => {
    provider.settings.tools = false;
    store.getState().setInitDir("/ws");
    useChat.setState({ scope: "all" });
    const bodies = mockRounds([[say("ok")]]);
    await sendMessage("fox", undefined);
    expect(bodies[0].tools).toBeUndefined();
    expect(bodies[0].messages[0].content).toContain("[1] Foxes are red.");
    provider.settings.tools = undefined;
  });
});

describe("all my notes and books (an option)", () => {
  const A = "a".repeat(32);
  const B = "b".repeat(32);

  test("the books searched too, by the snippets of the index; excluded ones never", async () => {
    note("/ws/n.md", "N", "Foxes in my notes.");
    vi.mocked(invoke).mockImplementation(async (cmd, args) => {
      if (cmd !== "index_search") return undefined;
      return (args as { kind: string }).kind === "book"
        ? [
            {
              id: `book:${A}#epubcfi(/6/4)`,
              path: "",
              kind: "book",
              title: "Fox Book",
              label: "Ch 1",
              snippet: "the <b>fox</b> &amp; the hound",
            },
            {
              id: `book:${B}#epubcfi(/6/2)`,
              path: "",
              kind: "book",
              title: "Private",
              label: "",
              snippet: "a <b>fox</b>",
            },
          ]
        : [{ id: "/ws/n.md", path: "/ws/n.md", kind: "note" }];
    });
    store
      .getState()
      .setAiSettings({ ...DEFAULT_AI_SETTINGS, excluded: ["private"] });
    expect(toolScopeOf("all")).toEqual({
      kind: "notes",
      label: "all the user's notes",
      books: false,
    });
    const off = await runTool(
      { id: "1", name: "search", input: { query: "fox" } },
      toolScopeOf("all")!,
      1,
    );
    expect(off.chunks.map((c) => c.text)).toEqual(["Foxes in my notes."]);

    store.getState().setAiSettings({
      ...DEFAULT_AI_SETTINGS,
      excluded: ["private"],
      myselfBooks: true,
    });
    const scope = toolScopeOf("all")!;
    expect(scope).toEqual({
      kind: "notes",
      label: "all the user's notes and books",
      books: true,
    });
    const on = await runTool(
      { id: "2", name: "search", input: { query: "fox" } },
      scope,
      1,
    );
    expect(on.chunks).toEqual([
      { text: "Foxes in my notes.", href: "N" },
      {
        text: "Fox Book · Ch 1: the fox & the hound",
        href: `book:${A}#epubcfi(%2F6%2F4)`,
      },
    ]);
    // a folder: its notes only, whatever the option
    expect(toolScopeOf("folder", "/ws/a")).not.toHaveProperty("books");
  });
});
