import { useEffect, useRef, useState } from "react";
import copy from "copy-to-clipboard";
import { TbBlockquote, TbFileText } from "react-icons/tb";
import { store, useStore } from "@/state/store";
import { usePlayer } from "@/player/playerStore";
import { noteContent } from "@/lib/contentCache";
import { editorOf } from "@/writer/editors";
import { useCurrentViewContext } from "@/state/useCurrentView";
import { openFilePath } from "@/workspace/open";
import type { PodType } from "@/types/model";
import { useT } from "@/i18n";
import {
  clock,
  parseTranscript,
  podcastHref,
  transcribeEpisode,
  transcriptOf,
} from "./transcript";
import type { Segment } from "./stt";
import { useAiProviders } from "./providers";

/** The paragraph playing: the last that started by then. */
export const playingAt = (paragraphs: Segment[], time: number) => {
  let at = -1;
  for (let i = 0; i < paragraphs.length && paragraphs[i].start <= time; i++)
    at = i;
  return at;
};

/** A paragraph of a transcript in a note, as a quote with a link to its time. */
export const quoteOfParagraph = (pod: PodType, p: Segment) =>
  `> ${p.text}\n>\n> — [${pod.title.replace(/[[\]]/g, "")} · ${clock(p.start)}](${podcastHref(pod.url, p.start)})`;

/**
 * The transcript of the podcast playing, under its controls: the paragraph
 * playing marked and in sight, a click on a time plays from there, a
 * paragraph quoted in the note beside or shown. Transcribed on demand.
 */
export default function TranscriptPanel({ pod }: { pod: PodType }) {
  const t = useT();
  const { dispatch } = useCurrentViewContext();
  const time = usePlayer((s) => s.podTime);
  const notes = useStore((s) => s.notes);
  const [path, setPath] = useState<string>();
  const [paragraphs, setParagraphs] = useState<Segment[]>([]);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const loaded = useAiProviders((s) => s.loaded);
  const canTranscribe = useAiProviders((s) =>
    s.providers.some(
      (p) => p.kind === "openai" && p.settings?.sttModel?.trim(),
    ),
  );
  useEffect(() => {
    if (!loaded)
      void useAiProviders
        .getState()
        .load()
        .catch(() => undefined);
  }, [loaded]);

  useEffect(() => {
    let live = true;
    setParagraphs([]);
    void transcriptOf(pod).then(async (found) => {
      if (!live) return;
      setPath(found);
      if (found)
        setParagraphs(parseTranscript(await noteContent(found)).paragraphs);
    });
    return () => {
      live = false;
    };
    // the note changed (made, edited): read again
  }, [pod, notes]);

  const at = playingAt(paragraphs, time);
  useEffect(() => {
    if (!open || at < 0) return;
    const item = listRef.current?.children[at] as HTMLElement | undefined;
    item?.scrollIntoView?.({ block: "nearest" });
  }, [at, open]);

  const run = async () => {
    setError("");
    try {
      const made = await transcribeEpisode(pod, (state, n, of) =>
        setProgress(
          state === "download"
            ? t("Fetching the audio…")
            : of && of > 1
              ? t("Transcribing part {n} of {of}…", {
                  n: Math.min(n! + 1, of),
                  of,
                })
              : t("Transcribing…"),
        ),
      );
      setPath(made);
      setParagraphs(parseTranscript(await noteContent(made)).paragraphs);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress("");
    }
  };

  const quote = (p: Segment) => {
    const markdown = quoteOfParagraph(pod, p);
    const { besideNoteId, currentNoteId } = store.getState();
    const id = [besideNoteId, currentNoteId].find((n) => n && editorOf(n));
    const put = id ? editorOf(id)?.insertMarkdown(markdown) : false;
    if (!put) copy(markdown, { format: "text/plain" });
    setDone(
      put ? t("Put in the note") : t("Copied: no note open to put it in"),
    );
  };

  if (!store.getState().initDir) return null;
  if (!path && !canTranscribe) return null;
  if (!path)
    return (
      <div
        className="flex items-center gap-2 pt-1 text-xs"
        data-testid="transcript"
      >
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          disabled={Boolean(progress)}
          onClick={() => void run()}
        >
          {progress || t("Transcribe")}
        </button>
        {error ? (
          <span className="text-error line-clamp-2">{error}</span>
        ) : null}
      </div>
    );
  return (
    <div className="pt-1 text-xs" data-testid="transcript">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? t("Hide the transcript") : t("Transcript")}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-square"
          title={t("Open the transcript as a note")}
          onClick={() =>
            void openFilePath(path, true).then((note) => {
              if (note) dispatch({ view: "md", params: { noteId: note.id } });
            })
          }
        >
          <TbFileText size={14} />
        </button>
        {done ? <span className="text-base-content/60">{done}</span> : null}
      </div>
      {open ? (
        <ol ref={listRef} className="overflow-y-auto max-h-48">
          {paragraphs.map((p, i) => (
            <li
              key={`${p.start}-${i}`}
              className={`group flex gap-2 px-1 py-0.5 rounded ${i === at ? "bg-primary/15" : ""}`}
              aria-current={i === at ? "true" : undefined}
            >
              <button
                type="button"
                className="shrink-0 link link-hover tabular-nums text-base-content/60"
                onClick={() => usePlayer.getState().seekPod?.(p.start)}
              >
                {clock(p.start)}
              </button>
              <span className="flex-1">{p.text}</span>
              <button
                type="button"
                className="invisible btn btn-ghost btn-xs btn-square group-hover:visible"
                title={t("Quote in the note, with a link to this time")}
                onClick={() => quote(p)}
              >
                <TbBlockquote size={12} />
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
