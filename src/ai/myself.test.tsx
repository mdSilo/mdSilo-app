import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { DEFAULT_AI_SETTINGS } from "@/state/userSettings";
import { defaultNote } from "@/types/model";
import { renderWithView, resetStore } from "@/testUtils";
import { PERMISSION_LABELS } from "@/plugins/manifest";
import { useAiProviders, type AiProvider } from "./providers";
import {
  isOwnNote,
  lineDiff,
  myselfPrompt,
  ownWords,
  proposeProfile,
  profilePath,
} from "./myself";
import { makeWeeklyReview } from "./review";
import ProfileModal, { useProfileModal } from "./ProfileModal";
import {
  forgetPluginRequests,
  messagesOfParams,
  pluginComplete,
  PLUGIN_RATE,
} from "./pluginApi";
import { newChat, sendMessage, useChat } from "./chat/chatStore";

const provider: AiProvider = {
  id: "p",
  kind: "openai",
  label: "P",
  baseUrl: "http://localhost:1/v1",
  hasKey: false,
  settings: { chatModel: "m" },
};

const note = (
  id: string,
  title: string,
  content: string,
  updated = "2026-11-19T10:00:00.000Z",
) =>
  store.getState().upsertNote({
    ...defaultNote,
    id,
    title,
    file_path: id,
    content,
    updated_at: updated,
  });

type StreamArgs = {
  body: Record<string, unknown> & {
    messages: { role: string; content: string }[];
  };
  onEvent: { onmessage: (e: unknown) => void };
};

/** the AI answering `answer`; the files written kept; the requests kept */
function mockAi(answer: string, files: Record<string, string> = {}) {
  const bodies: StreamArgs["body"][] = [];
  vi.mocked(invoke).mockImplementation(async (cmd, args) => {
    const a = args as Record<string, unknown>;
    switch (cmd) {
      case "ai_providers":
        return [provider];
      case "ai_stream": {
        const s = args as unknown as StreamArgs;
        bodies.push(structuredClone(s.body));
        s.onEvent.onmessage({
          type: "text",
          text: `data: ${JSON.stringify({ choices: [{ delta: { content: answer } }] })}\n\n`,
        });
        s.onEvent.onmessage({ type: "end" });
        return undefined;
      }
      case "read_file":
        return files[String(a.filePath)] ?? "";
      case "write_file":
        files[String(a.filePath)] = String(a.text);
        return true;
      case "file_exist":
        return false;
      case "get_dirpath":
        return String(a.path).replace(/\/[^/]*$/, "");
      default:
        return true;
    }
  });
  return bodies;
}

beforeEach(() => {
  resetStore();
  store.getState().setInitDir("/ws");
  store.getState().setLayout("workspace");
  store.getState().setAiSettings(DEFAULT_AI_SETTINGS);
  useAiProviders.setState({ providers: [], searchServices: [], loaded: false });
  newChat();
  useChat.setState({ scope: "auto", web: false });
  forgetPluginRequests();
});

describe("own words", () => {
  test("the user's notes only: not chats, transcripts, clips, hidden or excluded", async () => {
    const mine = {
      ...defaultNote,
      id: "/ws/writing/a.md",
      title: "a",
      file_path: "",
      is_dir: false,
    };
    expect(isOwnNote(mine)).toBe(true);
    for (const id of [
      "/ws/chats/c.md",
      "/ws/reading/transcripts/t.md",
      "/ws/reading/clips/x.md",
      "/ws/.mdsilo/ai/profile.md",
      "/ws/a.png",
    ])
      expect(isOwnNote({ ...mine, id })).toBe(false);

    note("/ws/a.md", "Old", "Old words", "2026-01-01T00:00:00.000Z");
    note(
      "/ws/b.md",
      "New",
      "---\ntitle: New\n---\nNew words",
      "2026-11-19T00:00:00.000Z",
    );
    note(
      "/ws/s.md",
      "Secret",
      "---\nai: false\n---\nHidden",
      "2026-11-19T01:00:00.000Z",
    );
    note("/ws/chats/c.md", "Chat", "AI words");
    const all = await ownWords();
    expect(all.notes).toBe(2);
    expect(all.text).toBe(
      "## New (2026-11-19)\nNew words\n\n## Old (2026-01-01)\nOld words",
    );
    expect((await ownWords({ since: new Date("2026-11-01") })).notes).toBe(1);
    expect((await ownWords({ budget: 30 })).notes).toBe(1);
  });

  test("lineDiff", () => {
    expect(lineDiff("a\nb\nc\n", "a\nc\nd\n")).toEqual([
      { type: "same", line: "a" },
      { type: "del", line: "b" },
      { type: "same", line: "c" },
      { type: "add", line: "d" },
    ]);
    expect(lineDiff("", "x")).toEqual([{ type: "add", line: "x" }]);
  });
});

describe("profile", () => {
  test("proposed of the notes and the profile now", async () => {
    note("/ws/a.md", "Gardens", "I love slow gardens.");
    const files = { [profilePath()!]: "## Interests\n- Old\n" };
    const bodies = mockAi("## Interests\n- Gardens [[Gardens]]", files);
    expect(await proposeProfile()).toBe(
      "## Interests\n- Gardens [[Gardens]]\n",
    );
    const user = bodies[0].messages[1].content;
    expect(user).toContain("The profile now:\n\n## Interests\n- Old");
    expect(user).toContain("## Gardens");
    expect(myselfPrompt("P")).toContain(
      "Their profile, made of their notes:\n\nP",
    );
    expect(myselfPrompt("")).not.toContain("profile");
  });

  test("the dialog: an update proposed as a change, taken", async () => {
    note("/ws/a.md", "Gardens", "I love slow gardens.");
    const path = profilePath()!;
    const files = { [path]: "## Interests\n- Old\n" };
    mockAi("## Interests\n- Gardens", files);
    renderWithView(<ProfileModal />);
    await act(async () => useProfileModal.setState({ open: true }));
    expect(await screen.findByDisplayValue(/- Old/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText("Propose an update"));
    });
    const diff = await screen.findByTestId("profile-diff");
    expect(diff.textContent).toContain("- - Old");
    expect(diff.textContent).toContain("+ - Gardens");
    expect(files[path]).toBe("## Interests\n- Old\n");
    await act(async () => {
      fireEvent.click(screen.getByText("Take it"));
    });
    await waitFor(() => expect(files[path]).toBe("## Interests\n- Gardens\n"));
  });

  test("the chat with all the notes: the profile and the note open given", async () => {
    note("/ws/a.md", "Gardens", "Slow gardens.");
    const bodies = mockAi("Yes.", {
      [profilePath()!]: "## Interests\n- Gardens",
    });
    await sendMessage(
      "What do I think?",
      { view: "md", params: { noteId: "/ws/a.md" } },
      { scope: "all" },
    );
    const system = String(bodies[0].messages[0].content);
    expect(system).toContain("thinking partner");
    expect(system).toContain("## Interests\n- Gardens");
    expect(system).toContain("[1] Slow gardens.");
    expect(bodies[0].tools).toBeDefined();
  });
});

test("the weekly review: of the notes changed this week, kept as a note", async () => {
  const now = new Date("2026-11-20T09:00:00.000Z");
  note("/ws/a.md", "Gardens", "Planted tulips.", "2026-11-18T10:00:00.000Z");
  note("/ws/old.md", "Old", "Long ago.", "2026-10-01T10:00:00.000Z");
  const files: Record<string, string> = {};
  const bodies = mockAi("## This week\nYou planted [[Gardens]].", files);
  const id = await makeWeeklyReview(now);
  expect(id).toMatch(/\/ws\/chats\/2026-11-\d\d Weekly review\.md$/);
  expect(bodies[0].messages[1].content).toContain("## Gardens");
  expect(bodies[0].messages[1].content).not.toContain("Old");
  expect(files[id!]).toContain("ai: review");
  expect(files[id!]).toContain("You planted [[Gardens]].");
});

describe("plugins", () => {
  test("ai.complete: its params checked", () => {
    expect(messagesOfParams({ prompt: "Hi", system: "Be brief" })).toEqual([
      { role: "system", content: "Be brief" },
      { role: "user", content: "Hi" },
    ]);
    expect(() => messagesOfParams({})).toThrow(/prompt/);
    expect(() =>
      messagesOfParams({ messages: [{ role: "tool", content: "x" }] }),
    ).toThrow(/role/);
    expect(() => messagesOfParams({ prompt: "x".repeat(100_001) })).toThrow(
      /at most/,
    );
    expect(PERMISSION_LABELS.ai).toMatch(/AI/);
  });

  test("ai.complete: answered; a few a minute at most", async () => {
    const bodies = mockAi("Hello");
    expect(
      await pluginComplete(
        "pl",
        { prompt: "Hi", role: "fast", maxTokens: 99_999 },
        1000,
      ),
    ).toEqual({ text: "Hello" });
    expect(bodies[0].max_tokens).toBe(16_000);
    for (let i = 1; i < PLUGIN_RATE; i++)
      await pluginComplete("pl", { prompt: "Hi" }, 1000 + i);
    await expect(pluginComplete("pl", { prompt: "Hi" }, 2000)).rejects.toThrow(
      /a minute/,
    );
    // another plugin, or a minute later: on
    await expect(
      pluginComplete("other", { prompt: "Hi" }, 2000),
    ).resolves.toEqual({ text: "Hello" });
    await expect(
      pluginComplete("pl", { prompt: "Hi" }, 70_000),
    ).resolves.toEqual({ text: "Hello" });
  });
});
