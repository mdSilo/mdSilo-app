import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { DEFAULT_AI_SETTINGS } from "@/state/userSettings";
import { defaultNote } from "@/types/model";
import { usePlayer } from "@/player/playerStore";
import { renderWithView, resetStore } from "@/testUtils";
import { useAiProviders, type AiProvider } from "./providers";
import { audioParts, segmentsOf, transcribe } from "./stt";
import {
  clock,
  paragraphsOf,
  parsePodcastHref,
  parseTranscript,
  playAt,
  podcastHref,
  transcriptMarkdown,
} from "./transcript";
import TranscriptPanel, {
  playingAt,
  quoteOfParagraph,
} from "./TranscriptPanel";
import DictateButton from "./DictateButton";
import { dayOf, digestIfDue, makeDigest, newArticles } from "./digest";

const whisper: AiProvider = {
  id: "w",
  kind: "openai",
  label: "W",
  baseUrl: "http://localhost:1/v1",
  hasKey: false,
  settings: { chatModel: "m", sttModel: "whisper-1" },
};
const pod = {
  title: "Ep 1",
  url: "https://p.example/ep1.mp3",
  article_url: "https://p.example/ep1",
  feed_link: "https://p.example/feed",
};

/** MPEG-1 layer III frames, 128 kbit/s, 44.1 kHz: 417 bytes, 1152 samples each */
function mp3(frames: number): Uint8Array {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  const id3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 2, 0, 0]);
  const out = new Uint8Array(id3.length + frames * 417);
  out.set(id3);
  for (let i = 0; i < frames; i++) out.set(frame, id3.length + i * 417);
  return out;
}

beforeEach(() => {
  resetStore();
  useAiProviders.setState({ providers: [], searchServices: [], loaded: false });
  usePlayer.setState({
    podTime: 0,
    seekPod: undefined,
    pendingSeek: undefined,
  });
});

describe("speech to text", () => {
  test("audio in parts: MP3 cut between frames, with the times they start at", () => {
    const small = new Uint8Array(10);
    expect(audioParts(small)).toEqual([{ bytes: small, offset: 0 }]);
    const parts = audioParts(mp3(100), 10_000);
    expect(parts.length).toBeGreaterThan(3);
    // the tag left out (not wanted by the services); each part cut at a frame
    for (const p of parts.slice(1))
      expect([p.bytes[0], p.bytes[1]]).toEqual([0xff, 0xfb]);
    expect(parts.reduce((n, p) => n + p.bytes.length, 0)).toBe(100 * 417);
    expect(parts.every((p) => p.bytes.length <= 10_000)).toBe(true);
    const framesInFirst = parts[0].bytes.length / 417;
    expect(parts[1].offset).toBeCloseTo((framesInFirst * 1152) / 44100, 5);
    expect(() => audioParts(new Uint8Array(20_000), 10_000)).toThrow(
      /only MP3/,
    );
  });

  test("segments: verbose JSON, else the text", () => {
    expect(
      segmentsOf(
        {
          segments: [
            { start: 1, end: 2, text: " Hi " },
            { start: 2, end: 3, text: " " },
          ],
        },
        10,
      ),
    ).toEqual([{ start: 11, end: 12, text: "Hi" }]);
    expect(segmentsOf({ text: "All" }, 5)).toEqual([
      { start: 5, end: 5, text: "All" },
    ]);
    expect(segmentsOf({})).toEqual([]);
  });

  test("sent raw to Rust with the fields in headers; no verbose JSON: plain", async () => {
    const calls: { bytes: Uint8Array; headers: Record<string, string> }[] = [];
    vi.mocked(invoke).mockImplementation(async (cmd, args, options) => {
      if (cmd === "ai_providers") return [whisper];
      if (cmd === "ai_upload") {
        const headers = (options as { headers: Record<string, string> })
          .headers;
        calls.push({ bytes: args as unknown as Uint8Array, headers });
        const fields = JSON.parse(decodeURIComponent(headers["x-fields"]));
        if (fields.response_format === "verbose_json")
          throw "400: response_format verbose_json is not supported";
        return { text: "hello there" };
      }
      return undefined;
    });
    const segments = await transcribe(
      new Uint8Array([1, 2, 3]),
      { name: "a b.webm", type: "audio/webm" },
      { language: "en" },
    );
    expect(segments).toEqual([{ start: 0, end: 0, text: "hello there" }]);
    expect(calls).toHaveLength(2);
    expect([...calls[0].bytes]).toEqual([1, 2, 3]);
    expect(decodeURIComponent(calls[0].headers["x-path"])).toBe(
      "/audio/transcriptions",
    );
    expect(decodeURIComponent(calls[0].headers["x-file-name"])).toBe(
      "a b.webm",
    );
    expect(
      JSON.parse(decodeURIComponent(calls[1].headers["x-fields"])),
    ).toEqual({
      model: "whisper-1",
      response_format: "json",
      language: "en",
    });
  });

  test("no provider of it: said where to set one", async () => {
    vi.mocked(invoke).mockResolvedValue([
      { ...whisper, settings: { chatModel: "m" } },
    ]);
    await expect(
      transcribe(new Uint8Array(1), { name: "a", type: "audio/webm" }),
    ).rejects.toThrow(/Settings > AI/);
  });
});

describe("transcripts", () => {
  test("times, links, paragraphs", () => {
    expect(clock(65)).toBe("1:05");
    expect(clock(3725)).toBe("1:02:05");
    const href = podcastHref("https://p.example/a b.mp3?x=1", 90.7);
    expect(href).toBe(
      "podcast:https%3A%2F%2Fp.example%2Fa%20b.mp3%3Fx%3D1#t=90",
    );
    expect(parsePodcastHref(href)).toEqual({
      audio: "https://p.example/a b.mp3?x=1",
      seconds: 90,
    });
    expect(parsePodcastHref("book:x")).toBeUndefined();
    expect(
      paragraphsOf([
        { start: 0, end: 5, text: "A." },
        { start: 5, end: 10, text: "B." },
        { start: 50, end: 55, text: "C." },
      ]),
    ).toEqual([
      { start: 0, end: 10, text: "A. B." },
      { start: 50, end: 55, text: "C." },
    ]);
  });

  test("a transcript note written and read back", () => {
    const md = transcriptMarkdown(pod, [
      { start: 0, end: 4, text: "Welcome." },
      { start: 70, end: 75, text: "Next part." },
    ]);
    expect(md).toContain('audio: "https://p.example/ep1.mp3"');
    expect(md).toContain(`[0:00](${podcastHref(pod.url, 0)}) Welcome.`);
    expect(md).toContain(`[1:10](${podcastHref(pod.url, 70)}) Next part.`);
    const back = parseTranscript(md);
    expect(back).toMatchObject({
      audio: pod.url,
      title: "Ep 1",
      article: pod.article_url,
      feed: pod.feed_link,
    });
    expect(back.paragraphs).toEqual([
      { start: 0, end: 0, text: "Welcome." },
      { start: 70, end: 70, text: "Next part." },
    ]);
  });

  test("playAt: the episode playing sought; another put in the player first", async () => {
    const seekPod = vi.fn();
    store.getState().setCurrentPod(pod);
    usePlayer.setState({ seekPod });
    await playAt(pod.url, 42);
    expect(seekPod).toHaveBeenCalledWith(42);

    store.getState().setInitDir("/ws");
    store.getState().upsertNote({
      ...defaultNote,
      id: "/ws/reading/transcripts/Ep 2.md",
      title: "Ep 2",
      file_path: "/ws/reading/transcripts/Ep 2.md",
      content: transcriptMarkdown(
        { ...pod, title: "Ep 2", url: "https://p.example/ep2.mp3" },
        [{ start: 0, end: 1, text: "x" }],
      ),
    });
    await playAt("https://p.example/ep2.mp3", 7);
    expect(store.getState().currentPod).toMatchObject({
      title: "Ep 2",
      url: "https://p.example/ep2.mp3",
      article_url: pod.article_url,
    });
    expect(usePlayer.getState().pendingSeek).toEqual({
      url: "https://p.example/ep2.mp3",
      seconds: 7,
    });
    expect(usePlayer.getState().shown).toBe(true);
  });

  test("the panel: the paragraph playing marked, a time played from, a quote", async () => {
    expect(
      playingAt(
        [
          { start: 0, end: 0, text: "a" },
          { start: 10, end: 10, text: "b" },
        ],
        12,
      ),
    ).toBe(1);
    expect(playingAt([{ start: 5, end: 5, text: "a" }], 1)).toBe(-1);
    expect(quoteOfParagraph(pod, { start: 75, end: 80, text: "Said." })).toBe(
      `> Said.\n>\n> — [Ep 1 · 1:15](${podcastHref(pod.url, 75)})`,
    );

    store.getState().setInitDir("/ws");
    const id = "/ws/transcripts/Ep 1.md";
    store.getState().upsertNote({
      ...defaultNote,
      id,
      title: "Ep 1",
      file_path: id,
      content: transcriptMarkdown(pod, [
        { start: 0, end: 4, text: "Welcome." },
        { start: 70, end: 75, text: "Next part." },
      ]),
    });
    vi.mocked(invoke).mockImplementation(async (cmd, args) => {
      if (cmd === "ai_providers") return [];
      if (cmd === "join_paths") {
        const { root, parts } = args as { root: string; parts: string[] };
        return [root, ...parts].join("/");
      }
      return undefined;
    });
    const seekPod = vi.fn();
    usePlayer.setState({ seekPod, podTime: 72 });
    renderWithView(<TranscriptPanel pod={pod} />);
    fireEvent.click(await screen.findByText("Transcript"));
    const current = await screen.findByText("Next part.");
    expect(current.closest("li")).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByText("0:00"));
    expect(seekPod).toHaveBeenCalledWith(0);
  });

  test("no transcript and no provider of speech to text: nothing shown", async () => {
    store.getState().setInitDir("/ws");
    vi.mocked(invoke).mockImplementation(async (cmd) =>
      cmd === "ai_providers" ? [] : false,
    );
    const { container } = renderWithView(<TranscriptPanel pod={pod} />);
    await waitFor(() => expect(useAiProviders.getState().loaded).toBe(true));
    expect(container.textContent).toBe("");
  });
});

test("dictation: none where the webview cannot record", async () => {
  vi.mocked(invoke).mockResolvedValue([whisper]);
  const { container } = render(<DictateButton noteId="/ws/a.md" />);
  await act(async () => undefined);
  // jsdom has no MediaRecorder
  expect(container.textContent).toBe("");
});

describe("digest", () => {
  const now = new Date(2026, 10, 20, 9);
  const article = (n: number, hoursAgo: number, read = 0) => ({
    id: n,
    title: `T${n}`,
    url: `https://n.example/${n}`,
    feed_link: "f",
    audio_url: "",
    description: `Text ${n}`,
    read_status: read,
    star_status: 0,
    published: new Date(now.getTime() - hoursAgo * 3600_000),
  });

  test("the unread articles new enough, the latest first", () => {
    expect(
      newArticles(
        [article(1, 2), article(2, 50), article(3, 1, 1), article(4, 1)],
        now,
      ).map((a) => a.id),
    ).toEqual([4, 1]);
  });

  test("made into a note citing its articles; once a day if set", async () => {
    store.getState().setInitDir("/ws");
    const written: Record<string, string> = {};
    let asked = "";
    vi.mocked(invoke).mockImplementation(async (cmd, args) => {
      const a = args as Record<string, unknown>;
      if (cmd === "get_articles") return [article(1, 2), article(2, 3)];
      if (cmd === "ai_providers") return [whisper];
      if (cmd === "ai_stream") {
        const s = a as unknown as {
          body: { messages: { content: string }[] };
          onEvent: { onmessage: (e: unknown) => void };
        };
        asked = s.body.messages[1].content;
        s.onEvent.onmessage({
          type: "text",
          text: 'data: {"choices":[{"delta":{"content":"## News\\nTwo things [1][2]."}}]}\n\n',
        });
        s.onEvent.onmessage({ type: "end" });
        return undefined;
      }
      if (cmd === "write_file") written[String(a.filePath)] = String(a.text);
      if (cmd === "file_exist") return false;
      if (cmd === "get_dirpath") return "/ws/chats";
      return true;
    });
    const id = await makeDigest(now);
    expect(id).toBe(`/ws/chats/${dayOf(now)} Digest.md`);
    expect(asked).toContain("[1] T1\nText 1");
    expect(written[id!]).toContain("ai: digest");
    expect(written[id!]).toContain(
      "Two things [1](https://n.example/1)[2](https://n.example/2).",
    );

    store.getState().setAiSettings({ ...DEFAULT_AI_SETTINGS, digest: true });
    await digestIfDue(now);
    expect(store.getState().aiSettings.lastDigest).toBe(dayOf(now));
    vi.mocked(invoke).mockClear();
    await digestIfDue(now);
    expect(invoke).not.toHaveBeenCalledWith("get_articles", expect.anything());
  });
});
