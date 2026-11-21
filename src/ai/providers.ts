import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { ProviderKind } from "./protocol";

/**
 * The AI providers set up by the user (B6, see docs/ai.md), kept with their
 * keys out of the workspace: on desktop in the app's data dir, read by Rust
 * only (src-tauri/src/ai), on web in the browser (src/host/web/ai.ts).
 */

export type ProviderSettings = {
  /** the model to chat with */
  chatModel?: string;
  /** a faster, cheaper model, for translation, titles, summaries of many items; the chat model if none */
  fastModel?: string;
  /** the most tokens of an answer */
  maxTokens?: number;
};

export type AiProvider = {
  id: string;
  kind: ProviderKind;
  label: string;
  /** e.g. https://api.openai.com/v1, http://localhost:11434/v1 */
  baseUrl: string;
  hasKey: boolean;
  settings: ProviderSettings;
};

/** A provider to save: `key` undefined keeps the key saved, '' forgets it. */
export type ProviderInput = Omit<AiProvider, "hasKey"> & { key?: string };

export type Preset = {
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  /** runs on this computer: nothing is sent out */
  local?: boolean;
  needsKey?: boolean;
  settings?: ProviderSettings;
};

/** The providers offered when adding one: their addresses filled in. */
export const PRESETS: Preset[] = [
  {
    name: "Ollama",
    kind: "openai",
    baseUrl: "http://localhost:11434/v1",
    local: true,
  },
  {
    name: "LM Studio",
    kind: "openai",
    baseUrl: "http://localhost:1234/v1",
    local: true,
  },
  {
    name: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    needsKey: true,
    settings: { chatModel: "claude-opus-5-5", fastModel: "claude-haiku-5-5" },
  },
  {
    name: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
  },
  {
    name: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
  },
  {
    name: "OpenAI-compatible",
    kind: "openai",
    baseUrl: "",
  },
];

/** The address, checked as Rust does: http(s), no query, no trailing slash. */
export function checkedBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Bad address: ${trimmed}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error(`Not an http(s) address: ${trimmed}`);
  if (parsed.search || parsed.hash)
    throw new Error(`The address has a query: ${trimmed}`);
  return trimmed;
}

/** A new id of a provider, not one of `taken`. */
export function newProviderId(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "provider";
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

type ProvidersState = {
  providers: AiProvider[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (provider: ProviderInput) => Promise<AiProvider>;
  remove: (id: string) => Promise<void>;
};

export const useAiProviders = create<ProvidersState>((set, get) => ({
  providers: [],
  loaded: false,
  load: async () => {
    const providers = (await invoke<AiProvider[]>("ai_providers")) ?? [];
    set({ providers, loaded: true });
  },
  save: async (provider) => {
    const saved = await invoke<AiProvider>("ai_save_provider", { provider });
    await get().load();
    return saved;
  },
  remove: async (id) => {
    await invoke("ai_delete_provider", { id });
    await get().load();
  },
}));

/** The providers, loaded once. */
export async function aiProviders(): Promise<AiProvider[]> {
  const state = useAiProviders.getState();
  if (!state.loaded) await state.load();
  return useAiProviders.getState().providers;
}

export type ModelRole = "chat" | "fast";

/** The provider chosen for a role, else the first one. */
export function providerFor(
  providers: AiProvider[],
  chosen: string | undefined,
): AiProvider | undefined {
  return providers.find((p) => p.id === chosen) ?? providers[0];
}

/** The model of a role: the fast one falls back on the chat one. */
export function modelFor(provider: AiProvider, role: ModelRole): string {
  const { chatModel = "", fastModel = "" } = provider.settings ?? {};
  return (role === "fast" ? fastModel || chatModel : chatModel).trim();
}
