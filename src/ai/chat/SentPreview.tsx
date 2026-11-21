import { useState } from "react";
import type { ViewState } from "@/state/viewReducer";
import { useT } from "@/i18n";
import { resolve } from "../client";
import { canUseTools } from "../providers";
import { contextOf, toolScopeOf, type Context } from "./context";
import { useChat } from "./chatStore";
import { excludedFolders } from "./privacy";

/** about this many characters a token: what the preview counts by */
const CHARS_A_TOKEN = 4;

type Preview = {
  context: Context | null;
  /** the tools, and what they look through; none without */
  tools?: string;
  /** a scope of tools with a model without them: one search with the question */
  searchOnly?: boolean;
  provider?: string;
  excluded: string[];
};

/**
 * What the next message sends besides itself (docs/ai.md, "What's sent"):
 * the passages, about how many tokens, the tools; asked when opened.
 */
export default function SentPreview({ view }: { view: ViewState }) {
  const t = useT();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [open, setOpen] = useState(false);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const { scope, folder, attached } = useChat.getState();
    const context = await contextOf(scope, view).catch(() => null);
    const toolScope = toolScopeOf(scope, folder);
    const provider = await resolve({}).then(
      (r) => r.provider,
      () => undefined,
    );
    const tools = toolScope && provider && canUseTools(provider);
    setPreview({
      context: attached?.text
        ? {
            label: context?.label ?? "",
            chunks: [
              { text: attached.text, href: "" },
              ...(context?.chunks ?? []),
            ],
            partial: context?.partial ?? false,
          }
        : context,
      tools: tools
        ? toolScope.kind === "book"
          ? t("in the whole book")
          : toolScope.dir
            ? t("in the folder {name}", {
                name: toolScope.dir.split(/[\\/]/).pop() ?? "",
              })
            : t("in all my notes")
        : undefined,
      searchOnly: Boolean(toolScope && !tools),
      provider: provider?.label,
      excluded: excludedFolders(),
    });
  };

  const chars = (preview?.context?.chunks ?? []).reduce(
    (n, c) => n + c.text.length,
    0,
  );
  return (
    <div className="mb-1 text-xs" data-testid="sent-preview">
      <button
        type="button"
        className="link link-hover text-base-content/60"
        aria-expanded={open}
        onClick={() => void toggle()}
      >
        {open ? t("Hide what's sent") : t("What's sent?")}
      </button>
      {open && preview ? (
        <div className="p-2 mt-1 space-y-1 rounded bg-base-200 max-h-48 overflow-y-auto">
          {preview.provider ? (
            <p>{t("To: {provider}", { provider: preview.provider })}</p>
          ) : null}
          <p>
            {preview.context?.chunks.length
              ? t("{count} passages, about {tokens} tokens: {label}", {
                  count: preview.context.chunks.length,
                  tokens: Math.ceil(chars / CHARS_A_TOKEN).toLocaleString(),
                  label: preview.context.label,
                })
              : preview.context?.label
                ? t("Nothing of {label}", { label: preview.context.label })
                : t("No passages")}
          </p>
          {preview.tools ? (
            <p>
              {t("Tools: search, read and list {what}, as the model asks", {
                what: preview.tools,
              })}
            </p>
          ) : null}
          {preview.searchOnly ? (
            <p>
              {t(
                "The model has no tools: the passages of one search with your message are sent.",
              )}
            </p>
          ) : null}
          {preview.excluded.length ? (
            <p>
              {t("Never read: {folders}, and notes with ai: false", {
                folders: preview.excluded.join(", "),
              })}
            </p>
          ) : (
            <p>{t("Never read: notes with ai: false")}</p>
          )}
          <ol className="pl-4 list-decimal text-base-content/70">
            {(preview.context?.chunks ?? []).slice(0, 30).map((c, i) => (
              <li key={i} className="truncate">
                {c.text}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
