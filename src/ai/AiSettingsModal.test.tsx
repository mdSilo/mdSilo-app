import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { store } from "@/state/store";
import { DEFAULT_AI_SETTINGS } from "@/state/userSettings";
import AiSettingsModal, { isLocalUrl } from "./AiSettingsModal";
import { useAiProviders, type AiProvider } from "./providers";
import { withUsage } from "./usage";

const saved: AiProvider = {
  id: "anthropic",
  kind: "anthropic",
  label: "Anthropic",
  baseUrl: "https://api.anthropic.com/v1",
  hasKey: true,
  settings: { chatModel: "claude-opus-5-5" },
};

let providers: AiProvider[] = [];

beforeEach(() => {
  providers = [saved];
  useAiProviders.setState({ providers: [], loaded: false });
  store
    .getState()
    .setAiSettings(withUsage(DEFAULT_AI_SETTINGS, "anthropic", 1200, 30));
  vi.mocked(invoke).mockImplementation(async (cmd, args) => {
    if (cmd === "ai_providers") return providers;
    if (cmd === "ai_save_provider") {
      const { provider } = args as {
        provider: AiProvider & { key?: string };
      };
      const { key, ...rest } = provider;
      const shown = { ...rest, hasKey: Boolean(key) };
      providers = [...providers.filter((p) => p.id !== shown.id), shown];
      return shown;
    }
    return undefined;
  });
});

async function open() {
  render(<AiSettingsModal />);
  await act(async () => store.getState().setIsAiSettingsOpen(true));
  return screen.findByTestId("ai-provider-anthropic");
}

test("shows the providers, a saved key only as saved, and the usage", async () => {
  const form = await open();
  // new: said so beside its name
  expect(screen.getByTestId("ai-alpha")).toHaveTextContent("α");
  expect(within(form).getByText("online")).toBeInTheDocument();
  expect(
    within(form).getByPlaceholderText("saved, type to change"),
  ).toBeInTheDocument();
  expect(within(form).getByDisplayValue("claude-opus-5-5")).toBeInTheDocument();
  expect(screen.getByTestId("ai-usage").textContent).toMatch(
    /1 requests, 1,200 tokens sent, 30 received/,
  );
});

test("adds a provider from a preset", async () => {
  await open();
  fireEvent.change(screen.getByLabelText("Add a provider"), {
    target: { value: "Ollama" },
  });
  const form = await screen.findByTestId("ai-provider-ollama");
  expect(within(form).getByText("on this computer")).toBeInTheDocument();
  expect(
    within(form).getByDisplayValue("http://localhost:11434/v1"),
  ).toBeInTheDocument();
  fireEvent.change(within(form).getAllByRole("combobox")[1], {
    target: { value: "llama3" },
  });
  await act(async () => {
    fireEvent.click(within(form).getByText("Save"));
  });
  expect(invoke).toHaveBeenCalledWith("ai_save_provider", {
    provider: {
      id: "ollama",
      kind: "openai",
      label: "Ollama",
      baseUrl: "http://localhost:11434/v1",
      settings: { chatModel: "llama3" },
      key: undefined,
    },
  });
  // saved: listed with the others, the form of a new one gone
  expect(await screen.findAllByTestId(/^ai-provider-/)).toHaveLength(2);
  expect(screen.getByLabelText("Add a provider")).toBeInTheDocument();
});

test("isLocalUrl", () => {
  expect(isLocalUrl("http://localhost:11434/v1")).toBe(true);
  expect(isLocalUrl("http://127.0.0.1:1234/v1")).toBe(true);
  expect(isLocalUrl("https://api.openai.com/v1")).toBe(false);
  expect(isLocalUrl("nope")).toBe(false);
});
