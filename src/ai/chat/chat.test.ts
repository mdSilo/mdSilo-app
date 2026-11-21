import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { DEFAULT_AI_SETTINGS } from "@/state/userSettings";
import { defaultNote } from "@/types/model";
import { useAiProviders, type AiProvider } from "../providers";
import {
  chatFileName,
  chatMarkdown,
  linkCitations,
  parseChat,
  unlinkCitations,
} from "./chatFile";
import {
  contextOf,
  markdownParagraphs,
  viewKindOf,
  withinBudget,
  type Chunk,
} from "./context";
import { messagesOf, POLISH_PROMPT, type ChatMsg } from "./prompt";
import { answerHtml } from "./render";
import {
  askAi,
  newChat,
  openChatNote,
  polishInChat,
  resolvePolish,
  sendMessage,
  useChat,
} from "./chatStore";

const sources: Chunk[] = [
  {
    text: "First passage.",
    href: "book:0123456789abcdef0123456789abcdef#epubcfi(/6/4!/4/2)",
  },
  { text: "Second passage.", href: "My%20note" },
];

describe("chat notes", () => {
  test("citations as links and back", () => {
    const linked = linkCitations(
      "A [1], B [2][1], C [3], code `[x]`.",
      sources,
    );
    expect(linked).toBe(
      "A [1](book:0123456789abcdef0123456789abcdef#epubcfi%28/6/4!/4/2%29), B [2](My%20note)[1](book:0123456789abcdef0123456789abcdef#epubcfi%28/6/4!/4/2%29), C [3], code `[x]`.",
    );
    const back = unlinkCitations(linked);
    expect(back.text).toBe("A [1], B [2][1], C [3], code `[x]`.");
    expect(back.sources.map((s) => s.href)).toEqual([
      "book:0123456789abcdef0123456789abcdef#epubcfi%28/6/4!/4/2%29",
      "My%20note",
    ]);
  });

  test("a chat written and read back", () => {
    const messages: ChatMsg[] = [
      {
        id: "1",
        role: "user",
        text: "What is it?",
        attached: { text: "Some text", from: "A [Book]", href: "book:x" },
      },
      { id: "2", role: "assistant", text: "It is [1].", sources, model: "m1" },
      { id: "3", role: "user", text: "And?" },
      // failed before any text: not kept
      { id: "4", role: "assistant", text: "", error: "boom" },
    ];
    const md = chatMarkdown(
      { title: 'A "title"', created: "2026-11-20T10:00:00.000Z", model: "m1" },
      messages,
    );
    expect(md).toContain('title: "A \\"title\\""');
    expect(md).toContain("ai: chat");
    expect(md).toContain("> Some text\n>\n> — [A Book](book:x)\n\nWhat is it?");
    expect(md).toContain("### AI · m1\n\nIt is [1](book:");
    expect(md).not.toContain("boom");
    const { meta, messages: back } = parseChat(md);
    expect(meta).toEqual({
      title: 'A "title"',
      created: "2026-11-20T10:00:00.000Z",
      model: "m1",
    });
    expect(back.map((m) => [m.role, m.text])).toEqual([
      ["user", "> Some text\n>\n> — [A Book](book:x)\n\nWhat is it?"],
      ["assistant", "It is [1]."],
      ["user", "And?"],
    ]);
    expect(back[1].model).toBe("m1");
    expect(back[1].sources?.[0].href).toMatch(/^book:/);
  });

  test("chatFileName", () => {
    expect(chatFileName('What: is "this"? a/b', new Date(2026, 10, 2))).toBe(
      "2026-11-02 What is this a b",
    );
    expect(chatFileName("", new Date(2026, 0, 1))).toBe("2026-01-01 Chat");
  });
});

describe("context", () => {
  const c = (text: string) => ({ text, href: "h" });

  test("withinBudget: from the start, then before it", () => {
    const chunks = ["aaaa", "bbbb", "cccc", "dddd"].map(c);
    expect(withinBudget(chunks, 0, 100)).toEqual({ chunks, partial: false });
    expect(withinBudget(chunks, 1, 8).chunks.map((x) => x.text)).toEqual([
      "bbbb",
      "cccc",
    ]);
    expect(withinBudget(chunks, 3, 8).chunks.map((x) => x.text)).toEqual([
      "cccc",
      "dddd",
    ]);
    expect(withinBudget([c("x".repeat(10))], 0, 4)).toEqual({
      chunks: [c("xxxx")],
      partial: true,
    });
  });

  test("markdownParagraphs: no front matter, code blocks whole", () => {
    expect(
      markdownParagraphs(
        "---\ntitle: x\n---\n# Head\n\nOne\nline two\n\n```js\na\n\nb\n```\n\nEnd",
      ),
    ).toEqual(["# Head", "One\nline two", "```js\na\n\nb\n```", "End"]);
  });

  test("of the note shown, and of the article", async () => {
    store.getState().upsertNote({
      ...defaultNote,
      id: "/ws/a.md",
      title: "My note",
      file_path: "/ws/a.md",
      content: "One\n\nTwo",
    });
    const view = { view: "md", params: { noteId: "/ws/a.md" } };
    expect(viewKindOf(view)).toBe("note");
    expect(await contextOf("auto", view)).toEqual({
      label: "My note",
      chunks: [
        { text: "One", href: "My%20note" },
        { text: "Two", href: "My%20note" },
      ],
      partial: false,
    });
    expect(await contextOf("none", view)).toBeNull();

    expect(viewKindOf({ view: "feed" })).toBe("none");
    store.getState().setCurrentArticle({
      id: 1,
      title: "News",
      url: "https://a.com/n",
      feed_link: "",
      audio_url: "",
      description: "",
      read_status: 0,
      star_status: 0,
      content: "<p>Para <b>one</b></p><div><p>Para two</p></div>",
    });
    expect(await contextOf("auto", { view: "feed" })).toEqual({
      label: "News",
      chunks: [
        { text: "Para one", href: "https://a.com/n" },
        { text: "Para two", href: "https://a.com/n" },
      ],
      partial: false,
    });
    store.getState().setCurrentArticle(null);
    expect(await contextOf("auto", { view: "chronicle" })).toBeNull();
  });
});

test("messagesOf: the passages numbered in the system prompt, the selection quoted", () => {
  const history: ChatMsg[] = [
    {
      id: "1",
      role: "user",
      text: "Q1",
      attached: { text: "sel\nmore", from: "B" },
    },
    { id: "2", role: "assistant", text: "A1" },
    { id: "3", role: "assistant", text: "" },
    { id: "4", role: "user", text: "Q2" },
  ];
  const messages = messagesOf(history, {
    label: "Book · Ch 1",
    chunks: sources,
    partial: true,
  });
  expect(messages[0].role).toBe("system");
  expect(messages[0].content).toContain(
    "The user has open: Book · Ch 1 (only a part",
  );
  expect(messages[0].content).toContain(
    "[1] First passage.\n\n[2] Second passage.",
  );
  expect(messages.slice(1)).toEqual([
    {
      role: "user",
      content:
        'About this passage I selected (from "B"):\n\n> sel\n> more\n\nQ1',
    },
    { role: "assistant", content: "A1" },
    { role: "user", content: "Q2" },
  ]);
  expect(messagesOf([], null)[0].content).not.toContain("numbered passages");
});

test("answerHtml: citations as links, not in code, unknown numbers as text", () => {
  const html = answerHtml("See [1] and [9].\n\n`[1]` in code", sources);
  const div = document.createElement("div");
  div.innerHTML = html;
  const cites = div.querySelectorAll("a.ai-cite");
  expect(cites).toHaveLength(1);
  expect((cites[0] as HTMLElement).dataset.cite).toBe("1");
  expect(cites[0].getAttribute("title")).toBe("First passage.");
  expect(div.textContent).toContain("[9]");
  expect(div.querySelector("code")?.textContent).toBe("[1]");
  // HTML of the model: text, never elements
  div.innerHTML = answerHtml("<img src=x onerror=alert(1)>");
  expect(div.querySelector("img")).toBeNull();
});

const provider: AiProvider = {
  id: "p",
  kind: "openai",
  label: "P",
  baseUrl: "http://localhost:1/v1",
  hasKey: false,
  settings: { chatModel: "m" },
};

type StreamArgs = {
  body: { messages: { content: string }[] };
  onEvent: { onmessage: (e: unknown) => void };
};

/** the provider answering these words, each a chunk; the files written kept */
function mockAi(words: string[], written: Record<string, string> = {}) {
  const bodies: StreamArgs["body"][] = [];
  vi.mocked(invoke).mockImplementation(async (cmd, args) => {
    const a = args as Record<string, unknown>;
    switch (cmd) {
      case "ai_providers":
        return [provider];
      case "ai_stream": {
        const s = args as unknown as StreamArgs;
        bodies.push(s.body);
        for (const w of words)
          s.onEvent.onmessage({
            type: "text",
            text: `data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`,
          });
        s.onEvent.onmessage({
          type: "text",
          text: 'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n',
        });
        s.onEvent.onmessage({ type: "end" });
        return undefined;
      }
      case "file_exist":
        return false;
      case "get_dirpath":
        return String(a.path).replace(/\/[^/]*$/, "");
      case "create_dir_recursive":
      case "write_file":
        if (cmd === "write_file") written[String(a.filePath)] = String(a.text);
        return true;
      default:
        return undefined;
    }
  });
  return bodies;
}

describe("chatStore", () => {
  beforeEach(() => {
    newChat();
    useChat.setState({ scope: "auto" });
    useAiProviders.setState({ providers: [], loaded: false });
    store.getState().setAiSettings(DEFAULT_AI_SETTINGS);
    store.getState().setInitDir("/ws");
  });

  test("sends with the note shown, streams the answer, keeps the chat in chats/", async () => {
    store.getState().upsertNote({
      ...defaultNote,
      id: "/ws/a.md",
      title: "Notes",
      file_path: "/ws/a.md",
      content: "Fact one.",
    });
    const written: Record<string, string> = {};
    const bodies = mockAi(["It is ", "[1]."], written);
    await sendMessage("What does it say?", {
      view: "md",
      params: { noteId: "/ws/a.md" },
    });
    const { messages, noteId, title } = useChat.getState();
    expect(title).toBe("What does it say?");
    expect(messages[1]).toMatchObject({
      role: "assistant",
      text: "It is [1].",
      model: "m",
      scopeLabel: "Notes",
      streaming: false,
    });
    expect(bodies[0].messages[0].content).toContain("[1] Fact one.");
    const day = chatFileName("x").slice(0, 10);
    expect(noteId).toBe(`/ws/chats/${day} What does it say.md`);
    expect(written[noteId!]).toContain("It is [1](Notes).");
    // the next answer: the same note
    await sendMessage("More?", undefined);
    expect(Object.keys(written)).toEqual([noteId]);
    expect(written[noteId!]).toContain("### Me\n\nMore?");
  });

  test("asked from a selection: opens the chat with it; a chat note goes on", async () => {
    askAi(undefined, { text: "picked" });
    expect(store.getState().isChatOpen).toBe(true);
    expect(useChat.getState().attached).toEqual({ text: "picked" });
    askAi("Explain this passage.");
    expect(useChat.getState().queued).toEqual({
      prompt: "Explain this passage.",
    });

    store.getState().upsertNote({
      ...defaultNote,
      id: "/ws/chats/c.md",
      title: "c",
      file_path: "/ws/chats/c.md",
      content:
        '---\ntitle: "Old"\nai: chat\ncreated: 2026-01-01\n---\n\n### Me\n\nHi\n\n### AI · m\n\nHello',
    });
    await openChatNote("/ws/chats/c.md");
    expect(useChat.getState()).toMatchObject({
      noteId: "/ws/chats/c.md",
      title: "Old",
    });
    expect(useChat.getState().messages).toHaveLength(2);
  });

  test("polish: the answer taken replaces the selection; none if discarded", async () => {
    mockAi(["Better text."]);
    const taken = polishInChat({ text: "bad text" });
    expect(useChat.getState().queued).toEqual({
      prompt: POLISH_PROMPT,
      polish: true,
    });
    await sendMessage(POLISH_PROMPT, undefined, { polish: true });
    const answer = useChat.getState().messages[1];
    expect(useChat.getState().polish?.msgId).toBe(answer.id);
    resolvePolish(answer.text);
    expect(await taken).toBe("Better text.");

    const discarded = polishInChat({ text: "x" });
    resolvePolish(undefined);
    expect(await discarded).toBeUndefined();
  });

  test("an error is shown on the answer, nothing kept", async () => {
    const written: Record<string, string> = {};
    mockAi([], written);
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "ai_providers") return [provider];
      if (cmd === "ai_stream") throw "401: bad key";
      return undefined;
    });
    await sendMessage("Hi", undefined);
    expect(useChat.getState().messages[1]).toMatchObject({
      error: "401: bad key",
      streaming: false,
    });
    expect(useChat.getState().busy).toBe(false);
    expect(written).toEqual({});
  });
});
