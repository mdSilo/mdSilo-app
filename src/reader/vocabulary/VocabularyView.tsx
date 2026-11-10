import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  TbArrowLeft,
  TbBook,
  TbCards,
  TbLayoutGrid,
  TbListCheck,
  TbTrash,
} from "react-icons/tb";
import ViewMenu from "@/shell/ViewMenu";
import ErrorBoundary from "@/ui/ErrorBoundary";
import { Spinner } from "@/ui/ui";
import { useCurrentViewContext } from "@/state/useCurrentView";
import { useStore } from "@/state/store";
import { sanitizeHtml } from "@/lib/sanitize";
import { t, useT } from "@/i18n";
import { findBookPath } from "../library/library";
import { openLinkOutside, targetLanguage } from "../lookup/lookup";
import Pronunciations from "../dictionary/Pronunciations";
import { playRecording } from "../dictionary/audio";
import {
  builtinSources,
  DEFAULT_DICTIONARY_SETTINGS,
} from "../dictionary/dictionary";
import { useLocalDictionaries } from "../dictionary/local";
// the recordings of dictionary files, played
import "../dictionary/mdict";
import { glossOf } from "../lens/lens";
import { withDefaults } from "../settings";
import { MAX_GLOSS, useVocabulary, type VocabularyEntry } from "./vocabulary";

/** The names of the dictionaries of the app, for the words kept before their name was. */
const BUILTIN_NAMES = new Map(
  builtinSources(DEFAULT_DICTIONARY_SETTINGS).map((s) => [s.id, s.label]),
);

/** The name of the dictionary a word was looked up in. */
export const sourceNameOf = (entry: VocabularyEntry) =>
  entry.sourceName ||
  (entry.source ? BUILTIN_NAMES.get(entry.source) : undefined);

/**
 * The gloss of a word in the books (word lens), as the user writes it; the
 * one made of its definition (or translation) shown when none is written.
 */
function GlossEditor({ entry }: { entry: VocabularyEntry }) {
  const t = useT();
  const ws = useStore((state) => state.initDir);
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const lang =
    settings.lensGloss === "translation"
      ? targetLanguage(settings.translateTo)
      : undefined;
  const [text, setText] = useState(entry.gloss ?? "");
  // another word, or its gloss changed elsewhere (synced)
  const [shown, setShown] = useState(entry);
  if (shown.id !== entry.id || shown.gloss !== entry.gloss) {
    setShown(entry);
    setText(entry.gloss ?? "");
  }
  const save = () => {
    if (ws && text.trim() !== (entry.gloss ?? ""))
      void useVocabulary.getState().setGloss(ws, entry.id, text);
  };
  return (
    <label
      className="flex items-center gap-2 mt-2 text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="opacity-60 shrink-0">{t("Gloss")}</span>
      <input
        className="flex-1 min-w-0 input input-xs input-bordered"
        aria-label={t("The gloss of {word} in the books", { word: entry.word })}
        placeholder={glossOf({ ...entry, gloss: undefined }, lang)}
        maxLength={MAX_GLOSS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(entry.gloss ?? "");
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}

/** The dictionary of a word, a line under it. */
function Source({ entry }: { entry: VocabularyEntry }) {
  const t = useT();
  const name = sourceNameOf(entry);
  return name ? (
    <div className="mt-2 text-xs opacity-50" data-testid="vocabulary-source">
      {t("From {name}", { name })}
    </div>
  ) : null;
}

type Mode = "study" | "grid" | "select";

const dateOf = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString() : "—";

/** The definition kept: HTML from the dictionary, sanitized again (the file may be edited). */
function Definition({
  entry,
  className = "",
}: {
  entry: VocabularyEntry;
  className?: string;
}) {
  const html = useMemo(
    () => sanitizeHtml(entry.definition),
    [entry.definition],
  );
  return (
    <div
      className={`[&_p]:mb-1 [&_a]:link ${className}`}
      onClick={openLinkOutside}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** The sentence the word was met in, and a link back to it in the book. */
function Context({ entry }: { entry: VocabularyEntry }) {
  const t = useT();
  const { dispatch } = useCurrentViewContext();
  const ws = useStore((state) => state.initDir);
  const { sentence, book, title, cfi } = entry.context ?? {};
  if (!sentence && !book) return null;
  const open = async () => {
    if (!ws || !book) return;
    const path = await findBookPath(ws, book);
    if (path) dispatch({ view: "book", path, cfi });
  };
  return (
    <div className="mt-3 text-sm text-left">
      {sentence ? (
        <p className="italic opacity-80">“{highlight(sentence, entry.word)}”</p>
      ) : null}
      {book ? (
        <button
          className="mt-1 text-xs link link-hover opacity-70"
          title={t("Open the book there")}
          onClick={(e) => {
            e.stopPropagation();
            void open();
          }}
        >
          <TbBook className="inline mr-1" />
          {title || t("The book")}
        </button>
      ) : null}
    </div>
  );
}

/** The word in its sentence, in bold. */
function highlight(sentence: string, word: string) {
  const at = sentence.toLowerCase().indexOf(word.trim().toLowerCase());
  if (at < 0) return sentence;
  return (
    <>
      {sentence.slice(0, at)}
      <b className="not-italic">
        {sentence.slice(at, at + word.trim().length)}
      </b>
      {sentence.slice(at + word.trim().length)}
    </>
  );
}

/**
 * A side of a card: the one turned away hidden. Not only by
 * `backface-visibility`, which a web view may not honor (WebKitGTK showed the
 * back over the front, mirrored): also by `visibility`, switched halfway
 * through the turn (500ms).
 */
const faceStyle = (shown: boolean): CSSProperties => ({
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  visibility: shown ? "visible" : "hidden",
  transition: "visibility 0s linear 250ms",
});

/** A card: the word, turned over to its definition. */
function StudyCard({
  entry,
  flipped,
  onFlip,
}: {
  entry: VocabularyEntry;
  flipped: boolean;
  onFlip: () => void;
}) {
  const t = useT();
  return (
    <div
      className="w-full h-80"
      style={{ perspective: "1000px" }}
      data-testid="vocabulary-card"
    >
      <div
        className="relative w-full h-full transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div
          className="absolute inset-0 shadow-lg rounded-xl bg-primary text-primary-content"
          style={faceStyle(!flipped)}
          aria-hidden={flipped}
        >
          <button
            className="absolute inset-0 flex flex-col items-center justify-center w-full p-4 text-center"
            onClick={onFlip}
            tabIndex={flipped ? -1 : 0}
          >
            <span className="mb-4 text-xs opacity-60">
              {entry.pronunciations?.some((p) => p.audio)
                ? t("Click or press space to see the meaning, P to hear it")
                : t("Click or press space to see the meaning")}
            </span>
            <span className="text-4xl font-bold break-words">{entry.word}</span>
            {entry.language ? (
              <span className="mt-4 text-xs opacity-60">{entry.language}</span>
            ) : null}
          </button>
          {/* to hear it before turning it: beside the card, not in it (no button in a button) */}
          {entry.pronunciations?.length && !flipped ? (
            <div className="absolute inset-x-0 flex justify-center bottom-6">
              <Pronunciations list={entry.pronunciations} className="" />
            </div>
          ) : null}
        </div>
        <div
          className="absolute inset-0 flex flex-col p-4 overflow-y-auto shadow-lg cursor-pointer rounded-xl bg-base-200"
          style={{ ...faceStyle(flipped), transform: "rotateY(180deg)" }}
          onClick={onFlip}
          aria-hidden={!flipped}
        >
          <div className="mb-2 text-xl font-bold">
            {entry.word}
            <Pronunciations
              list={entry.pronunciations}
              className="ml-2 text-base font-normal"
            />
          </div>
          <Definition entry={entry} className="text-sm" />
          <GlossEditor entry={entry} />
          <Context entry={entry} />
          <Source entry={entry} />
        </div>
      </div>
    </div>
  );
}

/** The vocabulary: words to learn, by cards or all at once; */
export default function Vocabulary() {
  const t = useT();
  const { dispatch } = useCurrentViewContext();
  const ws = useStore((state) => state.initDir);
  const entries = useVocabulary((state) => state.entries);
  const loaded = useVocabulary((state) => state.loaded && state.ws === ws);
  const [mode, setMode] = useState<Mode>("study");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // the recording of the card played by P that could not be: why
  const [playError, setPlayError] = useState("");

  useEffect(() => {
    if (ws) void useVocabulary.getState().load(ws);
  }, [ws]);

  // the dictionary files, to play their recordings
  const dictionariesWs = useLocalDictionaries((state) => state.ws);
  useEffect(() => {
    if (ws && dictionariesWs !== ws)
      void useLocalDictionaries.getState().load(ws);
  }, [ws, dictionariesWs]);

  // fewer words, e.g. one deleted
  useEffect(() => {
    if (index >= entries.length && entries.length > 0)
      setIndex(entries.length - 1);
  }, [entries.length, index]);

  const current = entries[Math.min(index, entries.length - 1)];
  const go = (to: number) => {
    setIndex(to);
    setFlipped(false);
    setPlayError("");
  };
  const next = () => {
    if (!ws || !current) return;
    // a card gone through: reviewed
    void useVocabulary.getState().recordReview(ws, current.id);
    if (index < entries.length - 1) go(index + 1);
  };
  const remove = (ids: string[]) => {
    if (ws) void useVocabulary.getState().remove(ws, ids);
  };

  // the keys of study: space turns the card, the arrows go through them
  useEffect(() => {
    if (mode !== "study") return;
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.target as Element | null)?.closest?.(
          "input, textarea, select, button",
        )
      )
        return;
      if (e.key === " ") setFlipped((f) => !f);
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft" && index > 0) go(index - 1);
      else if (e.key.toLowerCase() === "p" && !e.ctrlKey && !e.metaKey) {
        const audio = current?.pronunciations?.find((p) => p.audio)?.audio;
        if (!audio) return;
        setPlayError("");
        playRecording(audio).catch((err: unknown) =>
          setPlayError(err instanceof Error ? err.message : String(err)),
        );
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const modeButton = (m: Mode, title: string, icon: ReactNode) => (
    <button
      className={`btn btn-xs ${mode === m ? "btn-primary" : "btn-ghost"}`}
      title={title}
      aria-label={title}
      aria-pressed={mode === m}
      onClick={() => {
        setMode(m);
        setSelected(new Set());
      }}
    >
      {icon}
    </button>
  );

  return (
    <ErrorBoundary>
      {/* min-h-0: shrinks to the room left by the status bar */}
      <div
        className="flex flex-col w-full h-full min-h-0 bg-base-100"
        data-testid="vocabulary"
      >
        <div className="flex items-center gap-2 px-4 py-2 border-b border-base-300">
          <ViewMenu />
          <button
            className="btn btn-ghost btn-xs"
            title={t("Library")}
            aria-label={t("Library")}
            onClick={() => dispatch({ view: "library" })}
          >
            <TbArrowLeft size={18} />
          </button>
          <h1 className="flex-1 text-lg font-semibold">
            {t("Vocabulary")}{" "}
            {entries.length ? (
              <span className="font-normal opacity-60">({entries.length})</span>
            ) : null}
          </h1>
          {entries.length ? (
            <>
              {mode === "select" && selected.size > 0 ? (
                <button
                  className="btn btn-xs btn-error"
                  onClick={() => {
                    remove([...selected]);
                    setSelected(new Set());
                  }}
                >
                  <TbTrash /> {t("Delete {count}", { count: selected.size })}
                </button>
              ) : null}
              {modeButton("study", t("Study the cards"), <TbCards size={16} />)}
              {modeButton(
                "grid",
                t("All the words"),
                <TbLayoutGrid size={16} />,
              )}
              {modeButton(
                "select",
                t("Select words to delete"),
                <TbListCheck size={16} />,
              )}
            </>
          ) : null}
        </div>

        {!ws ? (
          <p className="p-8 text-center opacity-60">
            {t("Open a workspace to keep a vocabulary.")}
          </p>
        ) : !loaded ? (
          <div className="flex items-center justify-center flex-1">
            <Spinner />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 px-4 text-center">
            <TbCards size={48} className="opacity-40" />
            <h2 className="text-xl font-semibold">{t("No words yet")}</h2>
            <p className="max-w-sm opacity-60">
              {t(
                "Look up a word in a book (select it, then the dictionary) and add it to the vocabulary to learn it here.",
              )}
            </p>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => dispatch({ view: "library" })}
            >
              {t("Back to the library")}
            </button>
          </div>
        ) : mode === "select" ? (
          <ul className="flex-1 p-4 space-y-2 overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id}>
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer border-base-300 hover:bg-base-200">
                  <input
                    type="checkbox"
                    className="mt-1 checkbox checkbox-sm"
                    checked={selected.has(entry.id)}
                    aria-label={entry.word}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(entry.id)) next.delete(entry.id);
                        else next.add(entry.id);
                        return next;
                      })
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">
                      {entry.word}
                      {sourceNameOf(entry) ? (
                        <span className="ml-2 text-xs font-normal opacity-50">
                          {sourceNameOf(entry)}
                        </span>
                      ) : null}
                    </div>
                    <Definition
                      entry={entry}
                      className="text-sm overflow-y-auto max-h-24 opacity-80"
                    />
                  </div>
                </label>
              </li>
            ))}
          </ul>
        ) : mode === "grid" ? (
          <div className="grid flex-1 grid-cols-1 gap-4 p-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 auto-rows-max">
            {entries.map((entry, i) => (
              <div
                key={entry.id}
                className="relative p-4 shadow cursor-pointer rounded-xl bg-base-200 hover:shadow-md group"
                onClick={() => {
                  go(i);
                  setMode("study");
                }}
              >
                <button
                  className="absolute opacity-0 top-2 right-2 btn btn-ghost btn-xs text-error group-hover:opacity-100"
                  title={t("Delete")}
                  aria-label={t("Delete {word}", { word: entry.word })}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove([entry.id]);
                  }}
                >
                  <TbTrash />
                </button>
                <div className="pr-6 mb-1 text-lg font-bold break-words">
                  {entry.word}
                  <Pronunciations
                    list={entry.pronunciations}
                    className="ml-1 text-sm font-normal"
                  />
                </div>
                <Definition
                  entry={entry}
                  className="overflow-y-auto text-sm max-h-40 opacity-80"
                />
                <Source entry={entry} />
                {entry.reviewCount ? (
                  <div className="mt-2 text-xs opacity-50">
                    {t("Reviewed {count}×", { count: entry.reviewCount })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : current ? (
          <div className="flex flex-col items-center justify-center flex-1 p-6 overflow-y-auto">
            <div className="w-full max-w-md">
              <div className="flex justify-end mb-1">
                <button
                  className="btn btn-ghost btn-xs text-error"
                  title={t("Delete the word")}
                  aria-label={t("Delete the word")}
                  onClick={() => remove([current.id])}
                >
                  <TbTrash />
                </button>
              </div>
              <StudyCard
                entry={current}
                flipped={flipped}
                onFlip={() => setFlipped(!flipped)}
              />
              {playError ? (
                <p role="alert" className="mt-2 text-xs text-center text-error">
                  {playError}
                </p>
              ) : null}
              <div
                className="mt-6 text-sm text-center opacity-60"
                data-testid="vocabulary-position"
              >
                {index + 1} / {entries.length}
              </div>
              <progress
                className="w-full mt-2 progress progress-primary"
                value={index + 1}
                max={entries.length}
              />
              <div className="flex justify-center gap-3 mt-6">
                <button
                  className="btn btn-sm btn-outline"
                  disabled={index === 0}
                  onClick={() => go(index - 1)}
                >
                  {t("Previous")}
                </button>
                <button className="btn btn-sm btn-primary" onClick={next}>
                  {index === entries.length - 1 ? t("Done") : t("Next")}
                </button>
              </div>
              <div className="mt-6 space-y-1 text-xs text-center opacity-50">
                {current.reviewCount ? (
                  <div>
                    {t("Reviewed {count}× · last {date}", {
                      count: current.reviewCount,
                      date: dateOf(current.lastReviewedAt),
                    })}
                  </div>
                ) : null}
                <div>
                  {t("Added {date}", { date: dateOf(current.addedAt) })}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ErrorBoundary>
  );
}
