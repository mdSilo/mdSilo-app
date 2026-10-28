import { memo, useEffect, useState, type RefObject } from 'react';
import { TbCheck, TbExternalLink, TbNote, TbVocabulary } from 'react-icons/tb';
import { openUrl } from '@/workspace/open';
import { useStore } from '@/state/store';
import { Spinner } from '@/components/misc/ui';
import {
  lookupWikipedia, lookupWiktionary, openLinkOutside, targetLanguage, translate, translateUrl, wikipediaSearchUrl,
  type DictionaryResult, type TranslationResult, type WikipediaResult,
} from '../lookup';
import { usePopups } from '../popups';
import { annotateSelection } from '../actions';
import { activeStore, useActiveStore } from '../readerStore';
import { getView } from '../view';
import { definitionOf, sameWord, sentenceAround, useVocabulary } from '../vocabulary';
import { Popup } from './BookPopups';

type Result =
  | { kind: 'dictionary'; data: DictionaryResult }
  | { kind: 'wikipedia'; data?: WikipediaResult }
  | { kind: 'translate'; data: TranslationResult };

const TITLES = { dictionary: 'Dictionary', wikipedia: 'Wikipedia', translate: 'Translation' };

/** The text selected, looked up in a dictionary, Wikipedia, or translated. */
function LookupPopup({ rootRef }: { rootRef: RefObject<HTMLDivElement | null> }) {
  const lookup = usePopups((state) => state.lookup);
  const translateTo = useStore((state) => state.readerSettings?.translateTo);
  const [result, setResult] = useState<Result | undefined>();
  const [error, setError] = useState('');
  const ws = useActiveStore((state) => state.ws);
  const vocabulary = useVocabulary((state) => state.entries);
  const vocabularyWs = useVocabulary((state) => state.ws);

  // the words kept, to tell if this one is
  useEffect(() => {
    if (lookup?.kind === 'dictionary' && ws && vocabularyWs !== ws) void useVocabulary.getState().load(ws);
  }, [lookup, ws, vocabularyWs]);

  useEffect(() => {
    if (!lookup) return;
    let cancelled = false;
    setResult(undefined);
    setError('');
    const { kind, selection } = lookup;
    const lang = getView()?.language?.canonical;
    const run = async (): Promise<Result> => {
      if (kind === 'dictionary') return { kind, data: await lookupWiktionary(selection.text, lang) };
      if (kind === 'wikipedia') return { kind, data: await lookupWikipedia(selection.text, lang) };
      return { kind, data: await translate(selection.text, targetLanguage(translateTo)) };
    };
    run()
      .then((res) => { if (!cancelled) setResult(res); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, [lookup, translateTo]);

  if (!lookup) return null;
  const { kind, selection } = lookup;
  const lang = getView()?.language?.canonical;
  const webUrl = kind === 'dictionary'
    ? `https://en.wiktionary.org/wiki/${encodeURIComponent(selection.text.trim())}`
    : kind === 'wikipedia'
      ? (result?.kind === 'wikipedia' && result.data?.url) || wikipediaSearchUrl(selection.text, lang)
      : translateUrl(selection.text, targetLanguage(translateTo));

  /** Keep what was found as the note of a highlight of the text. */
  const keep = (note: string) => {
    const created = annotateSelection(selection);
    activeStore().getState().updateNote(created.id, { note });
    usePopups.getState().clear();
  };

  return (
    <Popup box={selection.box} rootRef={rootRef} testId="lookup-popup" height={260} width={360}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase text-base-content/60">{TITLES[kind]}</span>
        <button className="btn btn-ghost btn-xs" title="Open on the web" onClick={() => void openUrl(webUrl)}>
          <TbExternalLink />
        </button>
      </div>
      <div className="overflow-y-auto text-sm max-h-60" onClick={openLinkOutside}>
        {error ? (
          <p className="text-error">Could not look it up: {error}</p>
        ) : !result ? (
          <Spinner size="sm" className="mx-auto my-4" />
        ) : result.kind === 'dictionary' ? (
          result.data.entries.length === 0 ? (
            <p className="text-base-content/60">No definition of “{result.data.word}”</p>
          ) : (
            result.data.entries.slice(0, 3).map((entry) => (
              <div key={entry.language} className="mb-2">
                <div className="font-semibold">{result.data.word} <span className="text-xs text-base-content/60">{entry.language}</span></div>
                {entry.meanings.slice(0, 4).map((m, i) => (
                  <div key={i}>
                    <div className="text-xs italic text-base-content/60">{m.partOfSpeech}</div>
                    <ol className="ml-5 list-decimal">
                      {m.definitions.slice(0, 4).map((d, j) => (
                        // sanitized in lookup.ts
                        <li key={j} dangerouslySetInnerHTML={{ __html: d }} />
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            ))
          )
        ) : result.kind === 'wikipedia' ? (
          result.data ? (
            <div>
              <div className="font-semibold">{result.data.title}</div>
              <p>{result.data.extract}</p>
            </div>
          ) : (
            <p className="text-base-content/60">No article: search it on the web.</p>
          )
        ) : (
          <p className="whitespace-pre-wrap" lang={result.data.to}>{result.data.text}</p>
        )}
      </div>
      {result && !error && (result.kind !== 'wikipedia' || result.data) ? (
        <div className="flex justify-end gap-1 mt-1">
          {result.kind === 'dictionary' && result.data.entries.length > 0 && ws ? (
            <AddWord ws={ws} result={result.data} kept={vocabulary.some((e) => sameWord(e, {
              word: result.data.word, language: definitionOf(result.data).language,
            }))} />
          ) : null}
          <button
            className="btn btn-ghost btn-xs"
            title="Highlight the text, with this as its note"
            onClick={() => keep(noteOf(result))}
          >
            <TbNote /> Keep as note
          </button>
        </div>
      ) : null}
    </Popup>
  );
}

/** Keep the word looked up in the vocabulary, with the sentence it is in and where. */
function AddWord({ ws, result, kept }: { ws: string; result: DictionaryResult; kept: boolean }) {
  const lookup = usePopups((state) => state.lookup);
  if (kept) {
    return (
      <span className="flex items-center gap-1 px-2 text-xs text-success" data-testid="word-kept">
        <TbCheck /> In vocabulary
      </span>
    );
  }
  const add = () => {
    const { hash, entry } = activeStore().getState();
    const selection = lookup?.selection;
    void useVocabulary.getState().add(ws, {
      word: result.word,
      ...definitionOf(result),
      source: 'wiktionary',
      context: {
        sentence: sentenceAround(selection?.range),
        ...(hash ? { book: hash, title: entry?.title } : {}),
        ...(selection?.cfi ? { cfi: selection.cfi } : {}),
      },
    });
  };
  return (
    <button className="btn btn-ghost btn-xs" title="Add the word to the vocabulary, to learn it" onClick={add}>
      <TbVocabulary /> Add to vocabulary
    </button>
  );
}

/** What was found, as the markdown of a note. */
export function noteOf(result: Result): string {
  if (result.kind === 'translate') return result.data.text;
  if (result.kind === 'wikipedia') {
    return result.data ? `${result.data.extract}\n\n[${result.data.title}](${result.data.url})` : '';
  }
  const plain = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const first = result.data.entries[0];
  if (!first) return '';
  return first.meanings
    .slice(0, 2)
    .map((m) => `*${m.partOfSpeech}* ${m.definitions.slice(0, 2).map(plain).join('; ')}`)
    .join('\n\n');
}

export default memo(LookupPopup);
