import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  TbArrowLeft, TbBook, TbCards, TbLayoutGrid, TbListCheck, TbTrash,
} from 'react-icons/tb';
import ErrorBoundary from '@/components/misc/ErrorBoundary';
import { Spinner } from '@/components/misc/ui';
import { useCurrentViewContext } from '@/state/useCurrentView';
import { useStore } from '@/state/store';
import { sanitizeHtml } from '@/lib/sanitize';
import { findBookPath } from '../library';
import { openLinkOutside } from '../lookup';
import { useVocabulary, type VocabularyEntry } from '../vocabulary';

type Mode = 'study' | 'grid' | 'select';

const dateOf = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '—');

/** The definition kept: HTML from the dictionary, sanitized again (the file may be edited). */
function Definition({ entry, className = '' }: { entry: VocabularyEntry; className?: string }) {
  const html = useMemo(() => sanitizeHtml(entry.definition), [entry.definition]);
  return <div className={`[&_p]:mb-1 [&_a]:link ${className}`} onClick={openLinkOutside} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** The sentence the word was met in, and a link back to it in the book. */
function Context({ entry }: { entry: VocabularyEntry }) {
  const { dispatch } = useCurrentViewContext();
  const ws = useStore((state) => state.initDir);
  const { sentence, book, title, cfi } = entry.context ?? {};
  if (!sentence && !book) return null;
  const open = async () => {
    if (!ws || !book) return;
    const path = await findBookPath(ws, book);
    if (path) dispatch({ view: 'book', path, cfi });
  };
  return (
    <div className="mt-3 text-sm text-left">
      {sentence ? <p className="italic opacity-80">“{highlight(sentence, entry.word)}”</p> : null}
      {book ? (
        <button
          className="mt-1 text-xs link link-hover opacity-70"
          title="Open the book there"
          onClick={(e) => {
            e.stopPropagation();
            void open();
          }}
        >
          <TbBook className="inline mr-1" />{title || 'The book'}
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
      <b className="not-italic">{sentence.slice(at, at + word.trim().length)}</b>
      {sentence.slice(at + word.trim().length)}
    </>
  );
}

/** A card: the word, turned over to its definition. */
function StudyCard({ entry, flipped, onFlip }: { entry: VocabularyEntry; flipped: boolean; onFlip: () => void }) {
  return (
    <div className="w-full h-80" style={{ perspective: '1000px' }} data-testid="vocabulary-card">
      <div
        className="relative w-full h-full transition-transform duration-500"
        style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        <button
          className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center shadow-lg rounded-xl bg-primary text-primary-content"
          style={{ backfaceVisibility: 'hidden' }}
          onClick={onFlip}
          aria-hidden={flipped}
          tabIndex={flipped ? -1 : 0}
        >
          <span className="mb-4 text-xs opacity-60">Click or press space to see the meaning</span>
          <span className="text-4xl font-bold break-words">{entry.word}</span>
          {entry.language ? <span className="mt-4 text-xs opacity-60">{entry.language}</span> : null}
        </button>
        <div
          className="absolute inset-0 flex flex-col p-4 overflow-y-auto shadow-lg cursor-pointer rounded-xl bg-base-200"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          onClick={onFlip}
          aria-hidden={!flipped}
        >
          <div className="mb-2 text-xl font-bold">{entry.word}</div>
          <Definition entry={entry} className="text-sm" />
          <Context entry={entry} />
        </div>
      </div>
    </div>
  );
}

/** The vocabulary: words to learn, by cards or all at once; as in readup. */
export default function Vocabulary() {
  const { dispatch } = useCurrentViewContext();
  const ws = useStore((state) => state.initDir);
  const entries = useVocabulary((state) => state.entries);
  const loaded = useVocabulary((state) => state.loaded && state.ws === ws);
  const [mode, setMode] = useState<Mode>('study');
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (ws) void useVocabulary.getState().load(ws);
  }, [ws]);

  // fewer words, e.g. one deleted
  useEffect(() => {
    if (index >= entries.length && entries.length > 0) setIndex(entries.length - 1);
  }, [entries.length, index]);

  const current = entries[Math.min(index, entries.length - 1)];
  const go = (to: number) => {
    setIndex(to);
    setFlipped(false);
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
    if (mode !== 'study') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest?.('input, textarea, select, button')) return;
      if (e.key === ' ') setFlipped((f) => !f);
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft' && index > 0) go(index - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const modeButton = (m: Mode, title: string, icon: ReactNode) => (
    <button
      className={`btn btn-xs ${mode === m ? 'btn-primary' : 'btn-ghost'}`}
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
      <div className="flex flex-col w-full h-full min-h-0 bg-base-100" data-testid="vocabulary">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-base-300">
          <button className="btn btn-ghost btn-xs" title="Library" aria-label="Library" onClick={() => dispatch({ view: 'library' })}>
            <TbArrowLeft size={18} />
          </button>
          <h1 className="flex-1 text-lg font-semibold">
            Vocabulary {entries.length ? <span className="font-normal opacity-60">({entries.length})</span> : null}
          </h1>
          {entries.length ? (
            <>
              {mode === 'select' && selected.size > 0 ? (
                <button
                  className="btn btn-xs btn-error"
                  onClick={() => {
                    remove([...selected]);
                    setSelected(new Set());
                  }}
                >
                  <TbTrash /> Delete {selected.size}
                </button>
              ) : null}
              {modeButton('study', 'Study the cards', <TbCards size={16} />)}
              {modeButton('grid', 'All the words', <TbLayoutGrid size={16} />)}
              {modeButton('select', 'Select words to delete', <TbListCheck size={16} />)}
            </>
          ) : null}
        </div>

        {!ws ? (
          <p className="p-8 text-center opacity-60">Open a workspace to keep a vocabulary.</p>
        ) : !loaded ? (
          <div className="flex items-center justify-center flex-1"><Spinner /></div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 px-4 text-center">
            <TbCards size={48} className="opacity-40" />
            <h2 className="text-xl font-semibold">No words yet</h2>
            <p className="max-w-sm opacity-60">
              Look up a word in a book (select it, then the dictionary) and add it to the vocabulary to learn it here.
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => dispatch({ view: 'library' })}>Back to the library</button>
          </div>
        ) : mode === 'select' ? (
          <ul className="flex-1 p-4 space-y-2 overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id}>
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer border-base-300 hover:bg-base-200">
                  <input
                    type="checkbox"
                    className="mt-1 checkbox checkbox-sm"
                    checked={selected.has(entry.id)}
                    aria-label={entry.word}
                    onChange={() => setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(entry.id)) next.delete(entry.id);
                      else next.add(entry.id);
                      return next;
                    })}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{entry.word}</div>
                    <Definition entry={entry} className="text-sm overflow-y-auto max-h-24 opacity-80" />
                  </div>
                </label>
              </li>
            ))}
          </ul>
        ) : mode === 'grid' ? (
          <div className="grid flex-1 grid-cols-1 gap-4 p-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 auto-rows-max">
            {entries.map((entry, i) => (
              <div
                key={entry.id}
                className="relative p-4 shadow cursor-pointer rounded-xl bg-base-200 hover:shadow-md group"
                onClick={() => {
                  go(i);
                  setMode('study');
                }}
              >
                <button
                  className="absolute opacity-0 top-2 right-2 btn btn-ghost btn-xs text-error group-hover:opacity-100"
                  title="Delete"
                  aria-label={`Delete ${entry.word}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove([entry.id]);
                  }}
                >
                  <TbTrash />
                </button>
                <div className="pr-6 mb-1 text-lg font-bold break-words">{entry.word}</div>
                <Definition entry={entry} className="overflow-y-auto text-sm max-h-40 opacity-80" />
                {entry.reviewCount ? <div className="mt-2 text-xs opacity-50">Reviewed {entry.reviewCount}×</div> : null}
              </div>
            ))}
          </div>
        ) : current ? (
          <div className="flex flex-col items-center justify-center flex-1 p-6 overflow-y-auto">
            <div className="w-full max-w-md">
              <div className="flex justify-end mb-1">
                <button
                  className="btn btn-ghost btn-xs text-error"
                  title="Delete the word"
                  aria-label="Delete the word"
                  onClick={() => remove([current.id])}
                >
                  <TbTrash />
                </button>
              </div>
              <StudyCard entry={current} flipped={flipped} onFlip={() => setFlipped(!flipped)} />
              <div className="mt-6 text-sm text-center opacity-60" data-testid="vocabulary-position">
                {index + 1} / {entries.length}
              </div>
              <progress className="w-full mt-2 progress progress-primary" value={index + 1} max={entries.length} />
              <div className="flex justify-center gap-3 mt-6">
                <button className="btn btn-sm btn-outline" disabled={index === 0} onClick={() => go(index - 1)}>
                  Previous
                </button>
                <button className="btn btn-sm btn-primary" onClick={next}>
                  {index === entries.length - 1 ? 'Done' : 'Next'}
                </button>
              </div>
              <div className="mt-6 space-y-1 text-xs text-center opacity-50">
                {current.reviewCount ? (
                  <div>Reviewed {current.reviewCount}× · last {dateOf(current.lastReviewedAt)}</div>
                ) : null}
                <div>Added {dateOf(current.addedAt)}</div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ErrorBoundary>
  );
}
