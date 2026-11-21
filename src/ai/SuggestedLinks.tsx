import { useEffect, useState } from "react";
import { TbLink } from "react-icons/tb";
import { store, useStore } from "@/state/store";
import { indexOf } from "@/lib/linkIndex";
import { useCurrentViewContext } from "@/state/useCurrentView";
import { openFilePath } from "@/workspace/open";
import { editorOf } from "@/writer/editors";
import { useT } from "@/i18n";
import { similarNotes } from "./embeddings";

type Suggestion = { id: string; title: string; score: number; passage: string };

/** The notes the note is linked with already, either way: not suggested. */
export function linkedWith(noteId: string): Set<string> {
  const { notes } = store.getState();
  const index = indexOf(notes);
  const title = notes.get(noteId)?.title ?? "";
  const byTitle = new Map(
    [...notes.values()].filter((n) => !n.is_dir).map((n) => [n.title, n.id]),
  );
  const linked = new Set<string>(index.linking([title]));
  for (const t of index.rawLinks(noteId)) {
    const id = byTitle.get(t);
    if (id) linked.add(id);
  }
  return linked;
}

/**
 * Links to suggest (docs/ai.md, "Suggestions"; opt-in): the notes on the same
 * ideas as this one, by the vectors of their paragraphs, not linked with it
 * yet; no request to the provider, the index made already. A click opens
 * one, "Link" puts `[[it]]` in the note.
 */
export default function SuggestedLinks({ noteId }: { noteId: string }) {
  const t = useT();
  const { dispatch } = useCurrentViewContext();
  const on = useStore((s) =>
    Boolean(s.aiSettings.embeddings && s.aiSettings.linkSuggestions),
  );
  const [found, setFound] = useState<Suggestion[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!on) return;
    let live = true;
    void similarNotes(noteId, { skip: linkedWith(noteId) })
      .then((s) => live && setFound(s))
      .catch(() => live && setFound([]));
    return () => {
      live = false;
    };
  }, [noteId, on, version]);

  if (!on || found.length === 0) return null;
  const link = (title: string) => {
    if (editorOf(noteId)?.insertMarkdown(`[[${title}]]`))
      setVersion((v) => v + 1);
  };
  return (
    <div className="mx-4 mb-6 text-sm" data-testid="suggested-links">
      <p className="mb-1 text-xs font-semibold text-base-content/60">
        {t("Notes on the same ideas, not linked yet")}
      </p>
      <ul className="space-y-1">
        {found.map((s) => (
          <li key={s.id} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <button
                type="button"
                className="link link-hover"
                onClick={() =>
                  void openFilePath(s.id, true).then((note) => {
                    if (note)
                      dispatch({ view: "md", params: { noteId: note.id } });
                  })
                }
              >
                {s.title}
              </button>
              <p className="text-xs text-base-content/60 line-clamp-2">
                {s.passage}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              title={t(
                "Put a link to it in this note, after the paragraph of the cursor",
              )}
              onClick={() => link(s.title)}
            >
              <TbLink size={14} />
              {t("Link")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
