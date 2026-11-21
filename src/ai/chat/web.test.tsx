import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { DEFAULT_AI_SETTINGS } from "@/state/userSettings";
import { renderWithView, resetStore } from "@/testUtils";
import { chatRequest, TurnReader } from "../protocol";
import {
  useAiProviders,
  type AiProvider,
  type SearchService,
} from "../providers";
import { newChat, sendMessage, useChat } from "./chatStore";
import ChatPane from "./ChatPane";
import { fillPrompt, usePrompts } from "./prompts";
import { anthropicWebTools, resultsOf, runWebTool, WEB_TOOLS } from "./web";

const service = (
  name: SearchService["settings"]["service"],
): SearchService => ({
  id: "web-search",
  kind: "search",
  label: name,
  baseUrl: "https://s.example",
  hasKey: true,
  settings: { service: name },
});

const claude: AiProvider = {
  id: "a",
  kind: "anthropic",
  label: "Anthropic",
  baseUrl: "https://api.anthropic.com/v1",
  hasKey: true,
  settings: { chatModel: "claude-opus-5-5" },
};
const local: AiProvider = {
  id: "o",
  kind: "openai",
  label: "Local",
  baseUrl: "http://localhost:1/v1",
  hasKey: false,
  settings: { chatModel: "m" },
};

const ev = (data: unknown) => ({
  event: "message",
  data: JSON.stringify(data),
});
const sse = (data: unknown) => ({
  type: "text",
  text: `data: ${JSON.stringify(data)}\n\n`,
});

beforeEach(() => {
  newChat();
  useChat.setState({ scope: "auto", web: false });
  useAiProviders.setState({ providers: [], searchServices: [], loaded: false });
  store.getState().setAiSettings(DEFAULT_AI_SETTINGS);
  store.getState().setInitDir(undefined);
});

describe("protocol: the web", () => {
  test("server tools go to Anthropic only", () => {
    const tools = [...anthropicWebTools(), ...WEB_TOOLS];
    const a = chatRequest("anthropic", [{ role: "user", content: "q" }], {
      model: "c",
      tools,
    }).body.tools as Record<string, unknown>[];
    expect(a.slice(0, 2)).toEqual([
      { type: "web_search_20260209", name: "web_search" },
      { type: "web_fetch_20260209", name: "web_fetch" },
    ]);
    const o = chatRequest("openai", [{ role: "user", content: "q" }], {
      model: "m",
      tools,
    }).body.tools as { function: { name: string } }[];
    expect(o.map((t) => t.function.name)).toEqual(["web_search", "fetch_page"]);
    expect(anthropicWebTools(true)).toEqual([
      { server: { type: "web_search_20250305", name: "web_search" } },
    ]);
  });

  test("TurnReader: a search run by Anthropic, the text citing it, a pause", () => {
    const turn = new TurnReader("anthropic");
    const out = [
      {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "server_tool_use",
          id: "s1",
          name: "web_search",
          input: {},
        },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"query":"tides"}' },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "web_search_tool_result",
          tool_use_id: "s1",
          content: [
            {
              type: "web_search_result",
              url: "https://t.example",
              title: "Tides",
            },
          ],
        },
      },
      { type: "content_block_stop", index: 1 },
      {
        type: "content_block_start",
        index: 2,
        content_block: { type: "text", text: "" },
      },
      {
        type: "content_block_delta",
        index: 2,
        delta: {
          type: "citations_delta",
          citation: {
            type: "web_search_result_location",
            url: "https://t.example",
            title: "Tides",
            cited_text: "The moon pulls.",
            encrypted_index: "x",
          },
        },
      },
      {
        type: "content_block_delta",
        index: 2,
        delta: { type: "text_delta", text: "The moon does it" },
      },
      { type: "content_block_stop", index: 2 },
      { type: "message_delta", delta: { stop_reason: "pause_turn" } },
    ].flatMap((e) => turn.push(ev(e)));
    expect(out).toContainEqual({
      type: "server_tool",
      name: "web_search",
      input: { query: "tides" },
    });
    expect(out).toContainEqual({
      type: "cite",
      sources: [
        { url: "https://t.example", title: "Tides", text: "The moon pulls." },
      ],
    });
    const done = turn.finish();
    expect(done.stopReason).toBe("pause_turn");
    expect(done.toolCalls).toEqual([]);
    const raw = done.raw as Record<string, unknown>[];
    expect(raw[0]).toMatchObject({
      type: "server_tool_use",
      input: { query: "tides" },
    });
    expect(raw[1].type).toBe("web_search_tool_result");
    expect(raw[2]).toMatchObject({
      type: "text",
      text: "The moon does it",
      citations: [{ url: "https://t.example" }],
    });
  });
});

describe("web tools of the app", () => {
  test("the results of each service", () => {
    expect(
      resultsOf(service("brave"), {
        web: {
          results: [
            { title: "A", url: "https://a.com", description: "<b>x</b> y" },
            { title: "Bad", url: "ftp://b" },
          ],
        },
      }),
    ).toEqual([
      { text: "A (https://a.com): x y", href: "https://a.com", title: "A" },
    ]);
    expect(
      resultsOf(service("searxng"), {
        results: [{ title: "S", url: "https://s.com", content: "c" }],
      }),
    ).toEqual([
      { text: "S (https://s.com): c", href: "https://s.com", title: "S" },
    ]);
    expect(resultsOf(service("tavily"), null)).toEqual([]);
  });

  test("search by the service, read a page", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd, args) => {
      if (cmd === "ai_fetch") {
        expect(args).toMatchObject({
          provider: "web-search",
          method: "POST",
          path: "/search",
          body: { query: "tides" },
        });
        return {
          results: [{ title: "T", url: "https://t.com", content: "moon" }],
        };
      }
      if (cmd === "fetch_url")
        return new TextEncoder().encode(
          "<html><head><title>Page</title></head><body><p>First para.</p><p>Second para.</p></body></html>",
        );
      return undefined;
    });
    const found = await runWebTool(
      { id: "1", name: "web_search", input: { query: "tides" } },
      service("tavily"),
      3,
    );
    expect(found.text).toBe("[3] T (https://t.com): moon");
    expect(found.step).toBe("web search: tides");
    const page = await runWebTool(
      { id: "2", name: "fetch_page", input: { url: "https://t.com" } },
      undefined,
      1,
    );
    expect(page.text).toBe("Page:\n\n[1] First para.\n\n[2] Second para.");
    expect(page.chunks[0]).toEqual({
      text: "First para.",
      href: "https://t.com",
      title: "Page",
    });
    expect(
      (
        await runWebTool(
          { id: "3", name: "web_search", input: { query: "x" } },
          undefined,
          1,
        )
      ).text,
    ).toBe("Error: No search service is set up.");
    expect(
      (
        await runWebTool(
          { id: "4", name: "fetch_page", input: { url: "file:///etc" } },
          undefined,
          1,
        )
      ).text,
    ).toMatch(/Not a web address/);
  });
});

type StreamArgs = {
  body: Record<string, unknown> & { messages: Record<string, unknown>[] };
  onEvent: { onmessage: (e: unknown) => void };
};

function mockRounds(
  providers: (AiProvider | SearchService)[],
  rounds: unknown[][],
  fail?: (body: StreamArgs["body"]) => string | undefined,
) {
  const bodies: StreamArgs["body"][] = [];
  vi.mocked(invoke).mockImplementation(async (cmd, args) => {
    if (cmd === "ai_providers") return providers;
    if (cmd === "ai_fetch")
      return {
        results: [{ title: "R", url: "https://r.com", content: "found" }],
      };
    if (cmd === "ai_stream") {
      const s = args as unknown as StreamArgs;
      bodies.push(structuredClone(s.body));
      const error = fail?.(s.body);
      if (error) throw error;
      for (const e of rounds[bodies.length - 1] ?? []) s.onEvent.onmessage(e);
      s.onEvent.onmessage({ type: "end" });
    }
    return undefined;
  });
  return bodies;
}

describe("the chat on the web", () => {
  test("Anthropic: its own search, cited by number, resumed after a pause", async () => {
    useChat.setState({ web: true });
    const bodies = mockRounds(
      [claude],
      [
        [
          sse({
            type: "content_block_start",
            index: 0,
            content_block: {
              type: "server_tool_use",
              id: "s1",
              name: "web_search",
              input: {},
            },
          }),
          sse({
            type: "content_block_delta",
            index: 0,
            delta: {
              type: "input_json_delta",
              partial_json: '{"query":"tides"}',
            },
          }),
          sse({ type: "content_block_stop", index: 0 }),
          sse({ type: "message_delta", delta: { stop_reason: "pause_turn" } }),
        ],
        [
          sse({
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          }),
          sse({
            type: "content_block_delta",
            index: 0,
            delta: {
              type: "citations_delta",
              citation: {
                url: "https://t.com",
                title: "Tides",
                cited_text: "The moon.",
              },
            },
          }),
          sse({
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "The moon" },
          }),
          sse({ type: "content_block_stop", index: 0 }),
          sse({
            type: "content_block_start",
            index: 1,
            content_block: { type: "text", text: "" },
          }),
          sse({
            type: "content_block_delta",
            index: 1,
            delta: { type: "text_delta", text: "." },
          }),
          sse({ type: "content_block_stop", index: 1 }),
        ],
      ],
    );
    await sendMessage("Why tides?", undefined);
    expect(bodies).toHaveLength(2);
    expect((bodies[0].tools as { type: string }[]).map((t) => t.type)).toEqual([
      "web_search_20260209",
      "web_fetch_20260209",
    ]);
    expect(bodies[0].system).toContain("You can search the web");
    // the paused answer sent back as it was, nothing added
    expect(bodies[1].messages.at(-1)).toMatchObject({ role: "assistant" });
    const answer = useChat.getState().messages[1];
    expect(answer.text).toBe("The moon[1].");
    expect(answer.steps).toEqual(["web search: tides"]);
    expect(answer.sources).toEqual([
      { text: "The moon.", href: "https://t.com", title: "Tides" },
    ]);
  });

  test("Anthropic: a model without the newer web tools gets the older", async () => {
    useChat.setState({ web: true });
    const bodies = mockRounds(
      [claude],
      [
        [],
        [
          sse({
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          }),
          sse({
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "ok" },
          }),
        ],
      ],
      (body) =>
        JSON.stringify(body.tools).includes("20260209")
          ? "400: web_search_20260209 is not supported by this model"
          : undefined,
    );
    await sendMessage("q", undefined);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].tools).toEqual([
      { type: "web_search_20250305", name: "web_search" },
    ]);
    expect(useChat.getState().messages[1].text).toBe("ok");
  });

  test("another provider: the search service, as a tool of the app", async () => {
    useChat.setState({ web: true });
    const call = sse({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "c1",
                function: { name: "web_search", arguments: '{"query":"r"}' },
              },
            ],
          },
        },
      ],
    });
    const bodies = mockRounds(
      [local, service("searxng")],
      [[call], [sse({ choices: [{ delta: { content: "Yes [1]." } }] })]],
    );
    await sendMessage("q", undefined);
    expect(
      (bodies[0].tools as { function: { name: string } }[]).map(
        (t) => t.function.name,
      ),
    ).toEqual(["web_search", "fetch_page"]);
    expect(bodies[1].messages.at(-1)).toEqual({
      role: "tool",
      tool_call_id: "c1",
      content: "[1] R (https://r.com): found",
    });
    expect(useChat.getState().messages[1]).toMatchObject({
      text: "Yes [1].",
      steps: ["web search: r"],
    });
  });

  test("web off, or no way to the web: no web tools", async () => {
    const bodies = mockRounds(
      [local],
      [
        [sse({ choices: [{ delta: { content: "a" } }] })],
        [sse({ choices: [{ delta: { content: "b" } }] })],
      ],
    );
    await sendMessage("q", undefined);
    useChat.setState({ web: true });
    await sendMessage("q2", undefined);
    expect(bodies[0].tools).toBeUndefined();
    expect(bodies[1].tools).toBeUndefined();
  });
});

describe("prompts", () => {
  test("fillPrompt", () => {
    expect(
      fillPrompt("Make {{selection}} from {{title}} into {{ lang }}", {
        attached: { text: "this", from: "Book" },
        lang: "fr",
      }),
    ).toEqual({ prompt: "Make this from Book into French", inPrompt: true });
    expect(fillPrompt("Critique it.", { lang: "en" })).toEqual({
      prompt: "Critique it.",
      inPrompt: false,
    });
  });

  test("kept in the workspace; shown in the chat and sent", async () => {
    const files: Record<string, string> = {};
    store.getState().setInitDir("/ws");
    store.getState().setLayout("workspace");
    vi.mocked(invoke).mockImplementation(async (cmd, args) => {
      const a = args as Record<string, string>;
      if (cmd === "write_file") files[a.filePath] = a.text;
      if (cmd === "read_file") return files[a.filePath] ?? "";
      if (cmd === "ai_providers") return [local];
      return true;
    });
    await usePrompts
      .getState()
      .save([
        {
          id: "p1",
          name: "Critique",
          prompt: "Critique {{selection}}",
          where: "workspace",
        },
      ]);
    const [path] = Object.keys(files);
    expect(path).toMatch(/\.mdsilo[\\/]ai-prompts\.json$/);
    expect(JSON.parse(files[path])).toEqual([
      { id: "p1", name: "Critique", prompt: "Critique {{selection}}" },
    ]);
    usePrompts.setState({ presets: [] });
    await usePrompts.getState().load();
    expect(usePrompts.getState().presets[0].name).toBe("Critique");
  });
});

describe("the pane", () => {
  beforeEach(() => resetStore());

  test("the web toggle: off without a way to the web, on with Anthropic", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) =>
      cmd === "ai_providers" ? [local] : undefined,
    );
    renderWithView(<ChatPane />);
    const toggle = await screen.findByTitle(/To search the web/);
    await waitFor(() => expect(toggle).toBeDisabled());

    act(() => useAiProviders.setState({ providers: [claude] }));
    const on = screen.getByTitle("Let the chat search the web");
    expect(on).toBeEnabled();
    fireEvent.click(on);
    expect(useChat.getState().web).toBe(true);
  });

  test("a prompt of the user: the text selected in it, sent", async () => {
    mockRounds([local], [[sse({ choices: [{ delta: { content: "done" } }] })]]);
    usePrompts.setState({
      presets: [
        {
          id: "p",
          name: "Shorten",
          prompt: "Shorten: {{selection}}",
          where: "workspace",
        },
      ],
    });
    useChat.setState({ attached: { text: "long text" } });
    renderWithView(<ChatPane />);
    await act(async () => {
      fireEvent.click(await screen.findByText("Shorten"));
    });
    await waitFor(() =>
      expect(useChat.getState().messages[0]?.text).toBe("Shorten: long text"),
    );
    expect(useChat.getState().messages[0].attached).toBeUndefined();
  });
});
