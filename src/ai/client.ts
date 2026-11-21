import { store } from "@/state/store";
import {
  chatRequest,
  deltasOf,
  MODELS_PATH,
  modelsOf,
  SseParser,
  stopMessage,
  type ChatMessage,
  type Delta,
} from "./protocol";
import {
  aiProviders,
  modelFor,
  providerFor,
  type AiProvider,
  type ModelRole,
} from "./providers";
import { fetchJson, streamText } from "./transport";
import { withUsage } from "./usage";

/**
 * Talking to the AI providers, one interface on desktop and web (see
 * docs/ai.md): `chat` streams the parts of an answer, `complete` waits for
 * the whole text.
 */

export class NoProviderError extends Error {
  constructor(message = "No AI provider is set up: add one in Settings > AI.") {
    super(message);
    this.name = "NoProviderError";
  }
}

export type ChatParams = {
  messages: ChatMessage[];
  /** the provider and model set for this role; chat by default */
  role?: ModelRole;
  /** a provider in place of the one of the role */
  provider?: AiProvider;
  /** a model in place of the one of the role */
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
};

/** The provider and model to use. */
export async function resolve(
  params: Pick<ChatParams, "role" | "provider" | "model">,
): Promise<{ provider: AiProvider; model: string }> {
  const role = params.role ?? "chat";
  let provider = params.provider;
  if (!provider) {
    const { chatProvider, fastProvider } = store.getState().aiSettings;
    const providers = await aiProviders();
    provider =
      role === "fast"
        ? providerFor(providers, fastProvider || chatProvider)
        : providerFor(providers, chatProvider);
  }
  if (!provider) throw new NoProviderError();
  const model = params.model?.trim() || modelFor(provider, role);
  if (!model)
    throw new NoProviderError(
      `No model is set for ${provider.label}: choose one in Settings > AI.`,
    );
  return { provider, model };
}

/** The parts of an answer, as they come; the tokens used are counted at the end. */
export async function* chat(params: ChatParams): AsyncGenerator<Delta> {
  const { provider, model } = await resolve(params);
  const maxTokens = params.maxTokens ?? provider.settings?.maxTokens;
  const { path, body } = chatRequest(provider.kind, params.messages, {
    model,
    maxTokens,
  });
  const parser = new SseParser();
  let input = 0;
  let output = 0;
  const read = function* (deltas: Delta[]) {
    for (const delta of deltas) {
      if (delta.type === "usage") {
        if (delta.input !== undefined) input = delta.input;
        if (delta.output !== undefined) output = delta.output;
      }
      yield delta;
    }
  };
  try {
    for await (const text of streamText(
      provider.id,
      path,
      body,
      params.signal,
    )) {
      for (const event of parser.push(text))
        yield* read(deltasOf(provider.kind, event));
    }
    for (const event of parser.end())
      yield* read(deltasOf(provider.kind, event));
  } finally {
    if (input || output) recordUsage(provider.id, input, output);
  }
}

/** The whole text of an answer; an error if there is none. */
export async function complete(params: ChatParams): Promise<string> {
  let text = "";
  let stopped: string | null = null;
  for await (const delta of chat(params)) {
    if (delta.type === "text") text += delta.text;
    else if (delta.type === "error") throw new Error(delta.message);
    else if (delta.type === "stop") stopped = stopMessage(delta.reason);
  }
  if (!text.trim()) throw new Error(stopped ?? "The model gave no answer.");
  return text;
}

/** The models the provider offers, if it lists them. */
export async function listModels(provider: AiProvider): Promise<string[]> {
  return modelsOf(await fetchJson(provider.id, "GET", MODELS_PATH));
}

function recordUsage(provider: string, input: number, output: number) {
  const { aiSettings, setAiSettings } = store.getState();
  setAiSettings(withUsage(aiSettings, provider, input, output));
}
