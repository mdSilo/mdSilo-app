import { useEffect, useId, useState } from "react";
import { store, useStore } from "@/state/store";
import { BaseModal } from "@/ui/BaseModal";
import { Select } from "@/ui/ui";
import { isWeb } from "@/workspace/util";
import { useT } from "@/i18n";
import { dataRoot } from "@/workspace/layout";
import { complete, listModels } from "./client";
import {
  newProviderId,
  PRESETS,
  SEARCH_SERVICES,
  type SearchService,
  type SearchServiceName,
  useAiProviders,
  type AiProvider,
  type Preset,
  type ProviderInput,
} from "./providers";
import type { ProviderKind } from "./protocol";
import { monthOf, usageOf } from "./usage";
import { usePrompts, type PromptPreset } from "./chat/prompts";

/** The address is on this computer: nothing is sent out. */
export function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/** A provider being edited: saved or not yet. */
type Draft = ProviderInput & { saved: boolean; hasKey: boolean };

const draftOf = (p: AiProvider): Draft => ({
  ...p,
  settings: { ...p.settings },
  saved: true,
});

function draftOfPreset(preset: Preset, taken: string[]): Draft {
  return {
    id: newProviderId(preset.name, taken),
    kind: preset.kind,
    label: preset.name,
    baseUrl: preset.baseUrl,
    settings: { ...(preset.settings ?? {}) },
    saved: false,
    hasKey: false,
  };
}

/** The settings of one provider: saved by its button; Test saves it first. */
function ProviderForm({
  draft: initial,
  onDone,
}: {
  draft: Draft;
  /** the new provider saved, or dropped */
  onDone?: () => void;
}) {
  const t = useT();
  const save = useAiProviders((s) => s.save);
  const remove = useAiProviders((s) => s.remove);
  const [draft, setDraft] = useState<Draft>(initial);
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const listId = useId();
  useEffect(() => setDraft(initial), [initial]);

  const set = (changes: Partial<Draft>) =>
    setDraft((d) => ({ ...d, ...changes }));
  const setSetting = (changes: Partial<Draft["settings"]>) =>
    setDraft((d) => ({ ...d, settings: { ...d.settings, ...changes } }));

  const persist = async (keyChange?: string) => {
    const saved = await save({
      id: draft.id,
      kind: draft.kind,
      label: draft.label.trim() || draft.id,
      baseUrl: draft.baseUrl,
      settings: draft.settings,
      key: keyChange ?? (key ? key : undefined),
    });
    setKey("");
    return saved;
  };
  const run = async (task: () => Promise<string>) => {
    setBusy(true);
    setMessage("");
    try {
      setMessage(await task());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSave = () =>
    run(async () => {
      await persist();
      onDone?.();
      return t("Saved");
    });
  const onTest = () =>
    run(async () => {
      const provider = await persist();
      const started = Date.now();
      const answer = await complete({
        provider,
        messages: [{ role: "user", content: "Reply with the word OK only." }],
        maxTokens: 1000,
      });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      return t("Answered in {seconds}s: {answer}", {
        seconds,
        answer: answer.trim().slice(0, 80),
      });
    });
  const onListModels = () =>
    run(async () => {
      const provider = await persist();
      const found = await listModels(provider);
      setModels(found);
      return found.length > 0
        ? t("{count} models found", { count: found.length })
        : t("The provider lists no models: type the name of one.");
    });
  const onDelete = () =>
    run(async () => {
      if (draft.saved) await remove(draft.id);
      onDone?.();
      return "";
    });

  const local = isLocalUrl(draft.baseUrl);
  return (
    <fieldset
      className="p-2 border rounded border-base-300"
      data-testid={`ai-provider-${draft.id}`}
    >
      <legend className="px-1 font-semibold">
        {draft.label || draft.id}
        <span
          className={`ml-2 badge badge-xs ${local ? "badge-success" : "badge-warning"}`}
        >
          {local ? t("on this computer") : t("online")}
        </span>
      </legend>
      <p className="mb-1 text-xs text-base-content/70">
        {local
          ? t("Runs on this computer: nothing you send leaves it.")
          : t("What you send to the AI goes to this service.")}
        {isWeb && local
          ? ` ${t("The server must allow this site, e.g. OLLAMA_ORIGINS for Ollama.")}`
          : null}
      </p>
      <Row label={t("Name")}>
        <input
          className="flex-1 input input-xs"
          value={draft.label}
          onChange={(e) => set({ label: e.target.value })}
        />
      </Row>
      <Row label={t("API")}>
        <select
          className="flex-1 select select-xs"
          value={draft.kind}
          onChange={(e) => set({ kind: e.target.value as ProviderKind })}
        >
          <option value="openai">{t("OpenAI-compatible")}</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </Row>
      <Row label={t("Address")}>
        <input
          className="flex-1 input input-xs"
          value={draft.baseUrl}
          placeholder="https://…/v1"
          onChange={(e) => set({ baseUrl: e.target.value })}
        />
      </Row>
      <Row label={t("API key")}>
        <input
          className="flex-1 input input-xs"
          type="password"
          autoComplete="off"
          value={key}
          placeholder={draft.hasKey ? t("saved, type to change") : t("none")}
          onChange={(e) => setKey(e.target.value)}
        />
        {draft.hasKey ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await persist("");
                set({ hasKey: false });
                return t("Key cleared");
              })
            }
          >
            {t("Clear")}
          </button>
        ) : null}
      </Row>
      <Row label={t("Chat model")}>
        <input
          className="flex-1 input input-xs"
          list={listId}
          value={draft.settings.chatModel ?? ""}
          onChange={(e) => setSetting({ chatModel: e.target.value })}
        />
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          disabled={busy || !draft.baseUrl}
          onClick={() => void onListModels()}
        >
          {t("List models")}
        </button>
      </Row>
      <Row label={t("Fast model")}>
        <input
          className="flex-1 input input-xs"
          list={listId}
          value={draft.settings.fastModel ?? ""}
          placeholder={t("the chat model")}
          onChange={(e) => setSetting({ fastModel: e.target.value })}
        />
      </Row>
      <Row label={t("Max tokens")}>
        <input
          className="flex-1 input input-xs"
          type="number"
          min={1}
          value={draft.settings.maxTokens ?? ""}
          placeholder={t("default")}
          onChange={(e) =>
            setSetting({
              maxTokens: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </Row>
      <label className="flex items-center gap-2 my-1">
        <input
          type="checkbox"
          className="checkbox checkbox-xs"
          checked={draft.settings.tools !== false}
          onChange={(e) => setSetting({ tools: e.target.checked })}
        />
        <span>{t("The model can use tools (search, read)")}</span>
      </label>
      <datalist id={listId}>
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center gap-2 mt-1">
        <button
          type="button"
          className="btn btn-primary btn-xs"
          disabled={busy || !draft.baseUrl}
          onClick={() => void onSave()}
        >
          {t("Save")}
        </button>
        <button
          type="button"
          className="btn btn-xs"
          disabled={busy || !draft.baseUrl}
          onClick={() => void onTest()}
        >
          {t("Test")}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs text-error"
          disabled={busy}
          onClick={() => void onDelete()}
        >
          {draft.saved ? t("Delete") : t("Cancel")}
        </button>
        {busy ? <span className="loading loading-spinner loading-xs" /> : null}
        {message ? (
          <span
            className="text-xs break-all text-base-content/70"
            data-testid="ai-provider-message"
          >
            {message}
          </span>
        ) : null}
      </div>
    </fieldset>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 my-1">
      <span className="w-24 shrink-0">{label}</span>
      {children}
    </label>
  );
}

/** The AI providers and which one does what, a dialog from the settings. */
export default function AiSettingsModal() {
  const t = useT();
  const isOpen = useStore((state) => state.isAiSettingsOpen);
  const setIsOpen = useStore((state) => state.setIsAiSettingsOpen);
  const aiSettings = useStore((state) => state.aiSettings);
  const setAiSettings = useStore((state) => state.setAiSettings);
  const providers = useAiProviders((s) => s.providers);
  const load = useAiProviders((s) => s.load);
  const [adding, setAdding] = useState<Draft | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) load().catch((e: unknown) => setError(String(e)));
  }, [isOpen, load]);

  const usage = usageOf(aiSettings);
  const add = (name: string) => {
    const preset = PRESETS.find((p) => p.name === name);
    if (preset)
      setAdding(
        draftOfPreset(
          preset,
          providers.map((p) => p.id),
        ),
      );
  };

  return (
    <BaseModal
      title={t("AI")}
      scrollBody
      isOpen={isOpen}
      handleClose={() => {
        setAdding(null);
        setIsOpen(false);
      }}
    >
      <div className="flex flex-col gap-3 p-3 text-sm text-left bg-base-200">
        <p className="text-xs text-base-content/70">
          {t(
            "Use a model on this computer (Ollama, LM Studio…) or a service with your own key. Keys are kept on this device only, never in the workspace.",
          )}
        </p>
        {error ? <p className="text-xs text-error">{error}</p> : null}
        {providers.length > 0 ? (
          <>
            <Select
              label={t("Chat with")}
              value={aiSettings.chatProvider || providers[0].id}
              onChange={(chatProvider) =>
                setAiSettings({ ...aiSettings, chatProvider })
              }
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Select
              label={t("Quick tasks (translation…)")}
              value={aiSettings.fastProvider}
              onChange={(fastProvider) =>
                setAiSettings({ ...aiSettings, fastProvider })
              }
            >
              <option value="">{t("Same as chat")}</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </>
        ) : null}
        {providers.map((p) => (
          <ProviderForm key={p.id} draft={draftOf(p)} />
        ))}
        {adding ? (
          <ProviderForm draft={adding} onDone={() => setAdding(null)} />
        ) : (
          <select
            className="self-start select select-xs"
            aria-label={t("Add a provider")}
            value=""
            onChange={(e) => add(e.target.value)}
          >
            <option value="" disabled>
              {t("Add a provider…")}
            </option>
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.local ? `${p.name} (${t("on this computer")})` : p.name}
              </option>
            ))}
          </select>
        )}
        <SearchServiceSettings />
        <PromptPresets />
        <ExcludedFolders />
        <p className="text-xs text-base-content/70" data-testid="ai-usage">
          {t(
            "This month ({month}): {requests} requests, {input} tokens sent, {output} received.",
            {
              month: monthOf(),
              requests: usage.requests,
              input: usage.input.toLocaleString(),
              output: usage.output.toLocaleString(),
            },
          )}
        </p>
      </div>
    </BaseModal>
  );
}

/** The folders the AI never reads, one a line, saved as typed. */
function ExcludedFolders() {
  const t = useT();
  const aiSettings = useStore((state) => state.aiSettings);
  const setAiSettings = useStore((state) => state.setAiSettings);
  const [text, setText] = useState((aiSettings.excluded ?? []).join("\n"));
  return (
    <label className="flex flex-col gap-1">
      <span>{t("Folders the AI never reads")}</span>
      <textarea
        className="textarea textarea-xs"
        rows={3}
        value={text}
        placeholder={"journal\nprivate/health"}
        onChange={(e) => {
          setText(e.target.value);
          setAiSettings({
            ...store.getState().aiSettings,
            excluded: e.target.value
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean),
          });
        }}
      />
      <span className="text-xs text-base-content/70">
        {t(
          "One folder of the workspace a line. A note is never read either if its front matter says ai: false.",
        )}
      </span>
    </label>
  );
}

/** The service of web search, for providers without one of their own. */
function SearchServiceSettings() {
  const t = useT();
  const services = useAiProviders((s) => s.searchServices);
  const save = useAiProviders((s) => s.save);
  const remove = useAiProviders((s) => s.remove);
  const current: SearchService | undefined = services[0];
  const [service, setService] = useState<SearchServiceName>(
    current?.settings.service ?? "searxng",
  );
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? "");
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    setService(current?.settings.service ?? "searxng");
    setBaseUrl(current?.baseUrl ?? "");
  }, [current]);
  const preset = SEARCH_SERVICES.find((s) => s.service === service)!;

  const onSave = async () => {
    setMessage("");
    try {
      await save({
        id: current?.id ?? "web-search",
        kind: "search",
        label: preset.name,
        baseUrl: baseUrl || preset.baseUrl,
        settings: { service },
        key: key ? key : undefined,
      });
      setKey("");
      setMessage(t("Saved"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <fieldset
      className="p-2 border rounded border-base-300"
      data-testid="ai-search-service"
    >
      <legend className="px-1 font-semibold">{t("Web search")}</legend>
      <p className="mb-1 text-xs text-base-content/70">
        {t(
          "Anthropic searches the web itself. For other providers, a search service lets the chat search the web and read pages.",
        )}
      </p>
      <Row label={t("Service")}>
        <select
          className="flex-1 select select-xs"
          value={service}
          onChange={(e) => {
            const next = e.target.value as SearchServiceName;
            setService(next);
            setBaseUrl(
              SEARCH_SERVICES.find((s) => s.service === next)?.baseUrl ?? "",
            );
          }}
        >
          {SEARCH_SERVICES.map((s) => (
            <option key={s.service} value={s.service}>
              {s.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label={t("Address")}>
        <input
          className="flex-1 input input-xs"
          value={baseUrl}
          placeholder={preset.baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </Row>
      <Row label={t("API key")}>
        <input
          className="flex-1 input input-xs"
          type="password"
          autoComplete="off"
          value={key}
          placeholder={
            current?.hasKey
              ? t("saved, type to change")
              : preset.needsKey
                ? ""
                : t("none")
          }
          onChange={(e) => setKey(e.target.value)}
        />
      </Row>
      <div className="flex items-center gap-2 mt-1">
        <button
          type="button"
          className="btn btn-primary btn-xs"
          onClick={() => void onSave()}
        >
          {t("Save")}
        </button>
        {current ? (
          <button
            type="button"
            className="btn btn-ghost btn-xs text-error"
            onClick={() => void remove(current.id).then(() => setMessage(""))}
          >
            {t("Delete")}
          </button>
        ) : null}
        {message ? (
          <span className="text-xs text-base-content/70">{message}</span>
        ) : null}
      </div>
    </fieldset>
  );
}

/** The prompts of the user, kept in the workspace. */
function PromptPresets() {
  const t = useT();
  // kept in the data folder of a workspace (not of a plain folder)
  const ws = useStore((state) => dataRoot(state));
  const presets = usePrompts((s) => s.presets);
  const [drafts, setDrafts] = useState<PromptPreset[]>(presets);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (ws) void usePrompts.getState().load();
  }, [ws]);
  useEffect(() => setDrafts(presets), [presets]);
  if (!ws) return null;

  const change = (id: string, changes: Partial<PromptPreset>) =>
    setDrafts((d) => d.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  const onSave = async () => {
    setMessage("");
    try {
      await usePrompts
        .getState()
        .save(drafts.filter((p) => p.name.trim() && p.prompt.trim()));
      setMessage(t("Saved"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <fieldset
      className="p-2 border rounded border-base-300"
      data-testid="ai-prompts"
    >
      <legend className="px-1 font-semibold">{t("Prompts")}</legend>
      <p className="mb-1 text-xs text-base-content/70">
        {t(
          "Your own prompts, in the chat and the AI menu of the editor; kept in the workspace. {{selection}}: the text selected; {{title}}: what it is from; {{lang}}: the language to translate to.",
        )}
      </p>
      {drafts.map((p) => (
        <div key={p.id} className="flex flex-col gap-1 mb-2">
          <div className="flex gap-1">
            <input
              className="flex-1 input input-xs"
              value={p.name}
              placeholder={t("Name")}
              aria-label={t("Name")}
              onChange={(e) => change(p.id, { name: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-ghost btn-xs text-error"
              onClick={() =>
                setDrafts((d) => d.filter((other) => other.id !== p.id))
              }
            >
              {t("Delete")}
            </button>
          </div>
          <textarea
            className="textarea textarea-xs"
            rows={2}
            value={p.prompt}
            placeholder={t("Prompt")}
            aria-label={t("Prompt")}
            onChange={(e) => change(p.id, { prompt: e.target.value })}
          />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-xs"
          onClick={() =>
            setDrafts((d) => [
              ...d,
              {
                id: `p${Date.now().toString(36)}`,
                name: "",
                prompt: "",
                where: "workspace",
              },
            ])
          }
        >
          {t("Add a prompt")}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-xs"
          onClick={() => void onSave()}
        >
          {t("Save")}
        </button>
        {message ? (
          <span className="text-xs text-base-content/70">{message}</span>
        ) : null}
      </div>
    </fieldset>
  );
}
