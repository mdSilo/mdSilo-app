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
  /** the model can call tools (search, read): on unless turned off */
  tools?: boolean;
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

/** A service of web search for the chat, for a provider without one of its own (see chat/web.ts). */
export type SearchServiceName = "searxng" | "brave" | "tavily";

export type SearchService = {
  id: string;
  kind: "search";
  label: string;
  baseUrl: string;
  hasKey: boolean;
  settings: { service: SearchServiceName };
};

export type SearchServiceInput = Omit<SearchService, "hasKey"> & {
  key?: string;
};

/** The services of web search offered: their addresses filled in. */
export const SEARCH_SERVICES: {
  service: SearchServiceName;
  name: string;
  baseUrl: string;
  needsKey: boolean;
}[] = [
  {
    service: "searxng",
    name: "SearXNG",
    baseUrl: "http://localhost:8888",
    needsKey: false,
  },
  {
    service: "brave",
    name: "Brave Search",
    baseUrl: "https://api.search.brave.com/res/v1",
    needsKey: true,
  },
  {
    service: "tavily",
    name: "Tavily",
    baseUrl: "https://api.tavily.com",
    needsKey: true,
  },
];

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
  /** the providers of models */
  providers: AiProvider[];
  /** the services of web search, kept with them */
  searchServices: SearchService[];
  loaded: boolean;
  load: () => Promise<void>;
  save: <T extends ProviderInput | SearchServiceInput>(
    provider: T,
  ) => Promise<T extends SearchServiceInput ? SearchService : AiProvider>;
  remove: (id: string) => Promise<void>;
};

export const useAiProviders = create<ProvidersState>((set, get) => ({
  providers: [],
  searchServices: [],
  loaded: false,
  load: async () => {
    const all =
      (await invoke<(AiProvider | SearchService)[]>("ai_providers")) ?? [];
    set({
      providers: all.filter((p): p is AiProvider => p.kind !== "search"),
      searchServices: all.filter(
        (p): p is SearchService => p.kind === "search",
      ),
      loaded: true,
    });
  },
  save: async (provider) => {
    const saved = await invoke<never>("ai_save_provider", { provider });
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

/** The service of web search set up, if any: the first. */
export async function searchService(): Promise<SearchService | undefined> {
  const state = useAiProviders.getState();
  if (!state.loaded) await state.load();
  return useAiProviders.getState().searchServices[0];
}

/** The provider's model can call tools: unless turned off in its settings. */
export const canUseTools = (provider: AiProvider) =>
  provider.settings?.tools !== false;

/** The model of a role: the fast one falls back on the chat one. */
export function modelFor(provider: AiProvider, role: ModelRole): string {
  const { chatModel = "", fastModel = "" } = provider.settings ?? {};
  return (role === "fast" ? fastModel || chatModel : chatModel).trim();
}
