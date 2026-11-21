import { useMemo } from "react";
import type { SelectionAction } from "mdsmirror";
import { store, useStore } from "@/state/store";
import { encodeHref } from "@/lib/mdlink";
import { useT } from "@/i18n";
import { targetLanguage } from "@/reader/lookup/lookup";
import { askAi, polishInChat, useChat } from "./chatStore";
import { fillPrompt, usePrompts } from "./prompts";
import { QUICK_PROMPTS, type Attached } from "./prompt";

/** a sparkle, the icon of the actions of the AI */
const ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2zm0-12a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2zM9 18a6 6 0 0 1 6-6a6 6 0 0 1-6-6a6 6 0 0 1-6 6a6 6 0 0 1 6 6z"/></svg>',
)}`;

/**
 * The actions of the AI on the text selected in a note, under the AI button of
 * the toolbar: ask about it, explain it in the chat; polish it, the text
 * replaced once the user takes the new one.
 */
export function useAiSelectionActions(noteId?: string): SelectionAction[] {
  const t = useT();
  const title = useStore((s) => (noteId ? s.notes.get(noteId)?.title : ""));
  const presets = usePrompts((s) => s.presets);
  return useMemo(() => {
    const attachedOf = (text: string, markdown?: string): Attached => ({
      text: markdown?.trim() || text,
      ...(title ? { from: title, href: encodeHref(title) } : {}),
    });
    return [
      {
        id: "ai:ask",
        title: t("Ask AI about it"),
        icon: ICON,
        run: async (text, { markdown }) => {
          askAi(undefined, attachedOf(text, markdown));
        },
      },
      {
        id: "ai:explain",
        title: t("Explain"),
        icon: ICON,
        run: async (text, { markdown }) => {
          askAi(QUICK_PROMPTS.explain, attachedOf(text, markdown));
        },
      },
      {
        id: "ai:polish",
        title: t("Polish"),
        icon: ICON,
        run: async (text, { markdown }) => {
          const polished = await polishInChat(attachedOf(text, markdown));
          // Markdown: what the model made bold or a link stays so
          return polished ? { replaceMarkdown: polished } : undefined;
        },
      },
      // the prompts of the user
      ...presets.map((p) => ({
        id: `ai:preset:${p.id}`,
        title: p.name,
        icon: ICON,
        run: async (text: string, { markdown }: { markdown?: string }) => {
          const attached = attachedOf(text, markdown);
          const { prompt, inPrompt } = fillPrompt(p.prompt, {
            attached,
            lang: targetLanguage(store.getState().readerSettings.translateTo),
          });
          // the text in the prompt: not sent again beside it
          if (inPrompt) useChat.setState({ attached: undefined });
          askAi(prompt, inPrompt ? undefined : attached);
        },
      })),
    ];
  }, [title, t, presets]);
}
