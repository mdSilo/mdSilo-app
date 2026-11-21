/**
 * Web stand-in of src-tauri/src/ai: the AI providers kept in IndexedDB, with
 * their keys, which the browser sends itself (src/ai/transport.ts); there is
 * no other place to keep them on web.
 */
import {
  checkedBaseUrl,
  type AiProvider,
  type ProviderInput,
} from "../../ai/providers";
import { KV, get, put } from "./idb";

const STORE_KEY = "ai_providers";

/** A provider as kept, with its key. */
export type StoredProvider = Omit<AiProvider, "hasKey"> & { key?: string };

async function stored(): Promise<StoredProvider[]> {
  return (await get<StoredProvider[]>(KV, STORE_KEY)) ?? [];
}

const shown = ({ key, ...p }: StoredProvider): AiProvider => ({
  ...p,
  hasKey: Boolean(key),
});

export async function aiProviders(): Promise<AiProvider[]> {
  return (await stored()).map(shown);
}

export async function saveProvider(input: ProviderInput): Promise<AiProvider> {
  const id = input.id?.trim();
  if (!id || id.length > 64) throw new Error("A provider needs an id");
  if (input.kind !== "openai" && input.kind !== "anthropic")
    throw new Error(`No provider kind ${String(input.kind)}`);
  const providers = await stored();
  const old = providers.find((p) => p.id === id);
  const key =
    input.key === undefined ? old?.key : input.key.trim() || undefined;
  const provider: StoredProvider = {
    id,
    kind: input.kind,
    label: input.label.trim(),
    baseUrl: checkedBaseUrl(input.baseUrl),
    settings: input.settings ?? {},
    ...(key ? { key } : {}),
  };
  const next = old
    ? providers.map((p) => (p.id === id ? provider : p))
    : [...providers, provider];
  await put(KV, next, STORE_KEY);
  return shown(provider);
}

export async function deleteProvider(id: string): Promise<void> {
  const providers = await stored();
  const next = providers.filter((p) => p.id !== id);
  if (next.length !== providers.length) await put(KV, next, STORE_KEY);
}

/** A provider with its key, to send a request. */
export async function storedProvider(id: string): Promise<StoredProvider> {
  const provider = (await stored()).find((p) => p.id === id);
  if (!provider) throw new Error(`No AI provider ${id}`);
  return provider;
}
