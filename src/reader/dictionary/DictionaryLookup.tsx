import { useEffect, useMemo, useRef, useState } from "react";
import {
  TbArrowLeft,
  TbCheck,
  TbExternalLink,
  TbNote,
  TbSettings,
  TbVocabulary,
} from "react-icons/tb";
import { openUrl } from "@/workspace/open";
import { store } from "@/state/store";
import { Spinner } from "@/ui/ui";
import {
  definitionOf,
  pronunciationsOf,
  textOfHtml,
  sameWord,
  sentenceAround,
  useVocabulary,
} from "../vocabulary/vocabulary";
import {
  openLinkOutside,
  type DictionaryResult,
  type Pronunciation,
} from "../lookup/lookup";
import Pronunciations from "./Pronunciations";
import {
  enabledSources,
  useDictionarySettings,
  useLocalSources,
  type DictionarySource,
} from "./dictionary";
import MdictEntry from "./MdictEntry";

type Found = { result?: DictionaryResult; error?: string };

/** The text looked up: a new one for each lookup (a selection of a book, of a note). */
export type LookupTarget = {
  text: string;
  /** the range of the text, while shown: for the sentence it is in */
  range?: Range;
  /** where it is in its book */
  cfi?: string;
};

/** Where the text is, kept with a word added to the vocabulary: its book. */
export type LookupPlace = { book?: string; title?: string };

/** The dictionary has the word: its entries, or an entry of a dictionary file. */
export const hasEntry = (result?: DictionaryResult) =>
  Boolean(result?.entries.length || result?.html);

const found = (f?: Found) => hasEntry(f?.result);

/** The tab shown first: the first dictionary that looks words up. */
const firstOf = (list: DictionarySource[]) =>
  (list.find((s) => s.lookup) ?? list[0])?.id;

/** The key of a word looked up in a dictionary. */
const keyOf = (id: string, word: string) => `${id}\n${word}`;

/**
 * The word selected, looked up in the dictionaries turned on: a tab for each,
 * in the order of the user. The first that has the word shows, unless the
 * user picks a tab. A link of an entry to another word looks that one up in
 * the same tab, with a way back.
 */
export default function DictionaryLookup({
  selection,
  lang,
  ws,
  onKeep,
  placeOf,
}: {
  selection: LookupTarget;
  lang?: string;
  ws?: string;
  /** keep what was found as the note of a highlight; none: no button */
  onKeep?: (note: string) => void;
  /** where the text is, for a word added to the vocabulary */
  placeOf?: () => LookupPlace;
}) {
  const settings = useDictionarySettings();
  const local = useLocalSources(ws);
  const sources = useMemo(
    () => enabledSources(settings, local),
    [settings, local],
  );
  const [active, setActive] = useState(() => firstOf(sources));
  // the user picked a tab: no more going on to the next
  const [picked, setPicked] = useState(false);
  const [results, setResults] = useState<Record<string, Found>>({});
  // the words looked up from links of the entries, the last shown
  const [trail, setTrail] = useState<string[]>([]);
  const word = trail.at(-1) ?? selection.text.trim();

  // a new word: from the first again
  const [shown, setShown] = useState(selection);
  if (shown !== selection) {
    setShown(selection);
    setResults({});
    setTrail([]);
    setPicked(false);
    setActive(firstOf(sources));
  }

  // a dictionary turned off while shown, or one not loaded yet: the first
  const source =
    sources.find((s) => s.id === active) ??
    sources.find((s) => s.id === firstOf(sources));
  const key = source ? keyOf(source.id, word) : "";

  // a dictionary file loaded after the tabs showed: first, if it is
  useEffect(() => {
    if (!picked && !trail.length && Object.keys(results).length === 0)
      setActive(firstOf(sources));
  }, [sources, picked, trail, results]);

  // look the word up in the tab shown, once: kept when another tab is
  // picked meanwhile, not when another word is selected
  const asked = useRef<{ selection: LookupTarget; keys: Set<string> }>(null);
  useEffect(() => {
    if (!source?.lookup || results[key]) return;
    if (asked.current?.selection !== selection)
      asked.current = { selection, keys: new Set() };
    const { keys } = asked.current;
    if (keys.has(key)) return;
    keys.add(key);
    source
      .lookup(word, lang)
      .then((result) => ({ result }))
      .catch((e: unknown) => ({
        error: e instanceof Error ? e.message : String(e),
      }))
      .then((f: Found) => {
        if (asked.current?.selection === selection)
          setResults((r) => ({ ...r, [key]: f }));
      });
  }, [source, key, selection, word, lang, results]);

  // not found: on to the next dictionary that looks words up
  useEffect(() => {
    if (
      picked ||
      trail.length ||
      !source ||
      !results[key] ||
      found(results[key])
    )
      return;
    const next = sources
      .slice(sources.indexOf(source) + 1)
      .find((s) => s.lookup && !results[keyOf(s.id, word)]);
    if (next) setActive(next.id);
  }, [picked, trail, source, sources, results, key, word]);

  // the tab shown, in view: those after the first few are scrolled to
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabsRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [source?.id]);

  const settingsButton = (
    <button
      className="btn btn-ghost btn-xs"
      title="Dictionaries"
      aria-label="Dictionary settings"
      onClick={() => store.getState().setIsDictionariesOpen(true)}
    >
      <TbSettings />
    </button>
  );

  if (!source) {
    return (
      <div className="text-sm">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold uppercase text-base-content/60">
            Dictionary
          </span>
          {settingsButton}
        </div>
        <p className="text-base-content/60">
          No dictionary is turned on: turn one on in the dictionary settings.
        </p>
      </div>
    );
  }

  const current = results[key];
  const result = current?.result;
  // the page found (an article of Wikipedia), else the page of the word
  const webUrl = source.url
    ? (hasEntry(result) && result?.url) || source.url(word, lang)
    : undefined;
  const navigate = (to: string) => {
    if (!to.trim() || to.trim() === word) return;
    setPicked(true);
    setTrail((t) => [...t, to.trim()]);
  };

  return (
    <>
      <div className="flex items-center gap-1 mb-1">
        {trail.length ? (
          <button
            className="btn btn-ghost btn-xs"
            title="Back"
            aria-label="Back"
            onClick={() => setTrail((t) => t.slice(0, -1))}
          >
            <TbArrowLeft />
          </button>
        ) : null}
        {sources.length > 1 ? (
          <div
            ref={tabsRef}
            role="tablist"
            className="flex flex-1 min-w-0 gap-1 overflow-x-auto no-scrollbar"
            // no scrollbar (it covered the tabs): the wheel scrolls them
            onWheel={(e) => {
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX))
                e.currentTarget.scrollLeft += e.deltaY;
            }}
          >
            {sources.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={s.id === source.id}
                title={s.label}
                className={`btn btn-xs shrink-0 max-w-40 ${s.id === source.id ? "btn-active" : "btn-ghost font-normal"}`}
                onClick={() => {
                  setPicked(true);
                  setActive(s.id);
                }}
              >
                <span className="truncate">{s.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <span className="flex-1 text-xs font-semibold uppercase text-base-content/60">
            {source.label}
          </span>
        )}
        {webUrl ? (
          <button
            className="btn btn-ghost btn-xs"
            title="Open on the web"
            onClick={() => void openUrl(webUrl)}
          >
            <TbExternalLink />
          </button>
        ) : null}
        {settingsButton}
      </div>
      <div
        className="overflow-y-auto text-sm max-h-60"
        onClick={openLinkOutside}
      >
        {!source.lookup ? (
          <LinkOnly source={source} url={webUrl} word={word} />
        ) : current?.error ? (
          <p className="text-error">Could not look it up: {current.error}</p>
        ) : !result ? (
          <Spinner size="sm" className="mx-auto my-4" />
        ) : result.html && source.dict && ws ? (
          <>
            {/* the entry has its headword: only its recordings above it */}
            {result.pronunciations?.length ? (
              <div className="-ml-1">
                <Pronunciations list={result.pronunciations} />
              </div>
            ) : null}
            <MdictEntry
              ws={ws}
              dict={source.dict}
              html={result.html}
              styles={result.styles}
              onNavigate={navigate}
            />
          </>
        ) : (
          <Entries result={result} />
        )}
      </div>
      {result && hasEntry(result) ? (
        <div className="flex justify-end gap-1 mt-1">
          {ws ? (
            <AddWord
              ws={ws}
              result={result}
              source={source}
              selection={selection}
              placeOf={placeOf}
            />
          ) : null}
          {onKeep ? (
            <button
              className="btn btn-ghost btn-xs"
              title="Highlight the text, with this as its note"
              onClick={() => onKeep(dictionaryNote(result))}
            >
              <TbNote /> Keep as note
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** A site with no API: its page of the word, opened in the browser. */
function LinkOnly({
  source,
  url,
  word,
}: {
  source: DictionarySource;
  url?: string;
  word: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-2">
      <div className="font-semibold">{word}</div>
      {url ? (
        <button
          className="btn btn-sm btn-primary"
          onClick={() => void openUrl(url)}
        >
          <TbExternalLink /> Open in {source.label}
        </button>
      ) : null}
      {url ? (
        <span className="text-xs break-all text-base-content/60">{url}</span>
      ) : null}
    </div>
  );
}

function Entries({ result }: { result: DictionaryResult }) {
  if (result.entries.length === 0)
    return (
      <p className="text-base-content/60">No definition of “{result.word}”</p>
    );
  return (
    <>
      {result.entries.slice(0, 3).map((entry, n) => (
        <div key={`${entry.language}-${n}`} className="mb-2">
          <div className="font-semibold">
            {result.word}{" "}
            <span className="text-xs font-normal text-base-content/60">
              {entry.language}
            </span>
            <Pronunciations list={entry.pronunciations} />
          </div>
          {entry.meanings.slice(0, 4).map((m, i) => (
            <div key={i}>
              {m.partOfSpeech ? (
                <div className="text-xs italic text-base-content/60">
                  {m.partOfSpeech}
                </div>
              ) : null}
              <ol className="ml-5 list-decimal">
                {m.definitions.slice(0, 4).map((d, j) => (
                  // sanitized or escaped where looked up
                  <li key={j} dangerouslySetInnerHTML={{ __html: d }} />
                ))}
              </ol>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/** Keep the word looked up in the vocabulary, with the sentence it is in and where. */
function AddWord({
  ws,
  result,
  source,
  selection,
  placeOf,
}: {
  ws: string;
  result: DictionaryResult;
  source: DictionarySource;
  selection: LookupTarget;
  placeOf?: () => LookupPlace;
}) {
  const vocabulary = useVocabulary((state) => state.entries);
  const vocabularyWs = useVocabulary((state) => state.ws);
  // the words kept, to tell if this one is
  useEffect(() => {
    if (vocabularyWs !== ws) void useVocabulary.getState().load(ws);
  }, [ws, vocabularyWs]);
  const kept = vocabulary.find((e) =>
    sameWord(e, {
      word: result.word,
      language: definitionOf(result).language,
    }),
  );
  // a word kept before its pronunciations were: given those found now
  const said = useMemo(() => pronunciationsOf(result), [result]);
  useEffect(() => {
    if (kept && !kept.pronunciations?.length && said.length)
      void useVocabulary.getState().addPronunciations(ws, kept.id, said);
  }, [ws, kept, said]);
  if (kept) {
    return (
      <span
        className="flex items-center gap-1 px-2 text-xs text-success"
        data-testid="word-kept"
      >
        <TbCheck /> In vocabulary
      </span>
    );
  }
  const add = () => {
    const { book, title } = placeOf?.() ?? {};
    void useVocabulary.getState().add(ws, {
      word: result.word,
      ...definitionOf(result),
      source: source.id,
      sourceName: source.label,
      ...(said.length ? { pronunciations: said } : {}),
      context: {
        sentence: sentenceAround(selection.range),
        ...(book ? { book, title } : {}),
        ...(selection.cfi ? { cfi: selection.cfi } : {}),
      },
    });
  };
  return (
    <button
      className="btn btn-ghost btn-xs"
      title="Add the word to the vocabulary, to learn it"
      onClick={add}
    >
      <TbVocabulary /> Add to vocabulary
    </button>
  );
}

/** What a dictionary found, as the markdown of a note. */
export function dictionaryNote(result: DictionaryResult): string {
  const plain = (html: string) =>
    html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const first = result.entries[0];
  if (!first) return result.html ? textOfHtml(result.html, 400) : "";
  return first.meanings
    .slice(0, 2)
    .map((m) => {
      const defs = m.definitions.slice(0, 2).map(plain).join("; ");
      return m.partOfSpeech ? `*${m.partOfSpeech}* ${defs}` : defs;
    })
    .join("\n\n");
}
