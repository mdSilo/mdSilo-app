import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { renderWithView, resetStore } from "@/testUtils";
import { useAiProviders, type AiProvider } from "../providers";
import ChatPane from "./ChatPane";
import { newChat, useChat } from "./chatStore";

const provider: AiProvider = {
  id: "p",
  kind: "openai",
  label: "P",
  baseUrl: "http://localhost:1/v1",
  hasKey: false,
  settings: { chatModel: "m" },
};

type StreamArgs = { onEvent: { onmessage: (e: unknown) => void } };

beforeEach(() => {
  resetStore();
  newChat();
  useAiProviders.setState({ providers: [], loaded: false });
});

test("no provider: offers to set one up", async () => {
  vi.mocked(invoke).mockResolvedValue([]);
  renderWithView(<ChatPane />);
  fireEvent.click(await screen.findByText("Set up AI"));
  expect(store.getState().isAiSettingsOpen).toBe(true);
});

test("asks and shows the answer: Enter sends; quick prompts with a selection", async () => {
  vi.mocked(invoke).mockImplementation(async (cmd, args) => {
    if (cmd === "ai_providers") return [provider];
    if (cmd === "ai_stream") {
      const s = args as unknown as StreamArgs;
      s.onEvent.onmessage({
        type: "text",
        text: 'data: {"choices":[{"delta":{"content":"**Hi** there"}}]}\n\n',
      });
      s.onEvent.onmessage({ type: "end" });
    }
    return undefined;
  });
  renderWithView(<ChatPane />);
  expect(await screen.findByText(/Ask about what is open/)).toBeInTheDocument();
  expect(screen.getByText("Nothing open to read")).toBeInTheDocument();

  const input = screen.getByLabelText("Message");
  fireEvent.change(input, { target: { value: "Hello" } });
  await act(async () => {
    fireEvent.keyDown(input, { key: "Enter" });
  });
  await waitFor(() =>
    expect(
      screen.getByTestId("chat-answer").querySelector("strong")?.textContent,
    ).toBe("Hi"),
  );
  expect(screen.getByText("Hello")).toBeInTheDocument();
  expect((input as HTMLTextAreaElement).value).toBe("");

  // a text selected: shown, with the prompts for it
  act(() => useChat.setState({ attached: { text: "A passage" } }));
  expect(screen.getByText("A passage")).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByText("Explain"));
  });
  await waitFor(() =>
    expect(screen.getAllByTestId("chat-answer")).toHaveLength(2),
  );
  expect(useChat.getState().attached).toBeUndefined();
  expect(useChat.getState().messages[2]).toMatchObject({
    text: "Explain this passage.",
    attached: { text: "A passage" },
  });

  fireEvent.click(screen.getByTitle("Close (Ctrl/⌘+J)"));
  expect(store.getState().isChatOpen).toBe(false);
});
