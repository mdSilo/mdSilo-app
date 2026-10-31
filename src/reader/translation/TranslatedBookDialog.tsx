import { useEffect, useRef, useState } from 'react';
import { BaseModal } from '@/ui/BaseModal';
import { Spinner } from '@/ui/ui';
import { useStore } from '@/state/store';
import { HUMAN_LANGUAGES } from '@/lib/constants';
import { useReaderChrome } from '../chrome';
import { readBytes } from '../library/library';
import { targetLanguage, translatorOf } from '../lookup/lookup';
import { useActiveStore } from '../readerStore';
import { withDefaults } from '../settings';
import { translatedCountOfBook, translatedEpubOfBook } from './bookToEpub';
import { saveTranslatedBook, translateMissing } from './translatedBook';
import { scopeOf, translatedCount, translatedEpub, translationsOf } from './translation';

type Count = { total: number; done: number; missing: string[] };

/**
 * The translations kept of the book read, made a whole translated book: the
 * paragraphs not translated yet translated first, if wanted (slowly, not to
 * be refused by the service), or left as they are.
 */
export default function TranslatedBookDialog() {
  const close = () => useReaderChrome.getState().setTranslatedBook(false);
  const ws = useActiveStore((state) => state.ws);
  const hash = useActiveStore((state) => state.hash);
  const path = useActiveStore((state) => state.path);
  const entry = useActiveStore((state) => state.entry);
  const book = useActiveStore((state) => state.book);
  // an EPUB: itself with the translations; another format: an EPUB made of its pages
  const epub = useActiveStore((state) => state.format === 'EPUB');
  const settings = withDefaults(useStore((state) => state.readerSettings));
  const translator = translatorOf(settings.translator);
  const lang = targetLanguage(settings.translateTo);
  const only = settings.translationOnly;
  const scope = scopeOf(translator.name, lang);
  const [count, setCount] = useState<Count>();
  const [progress, setProgress] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [made, setMade] = useState('');
  const abort = useRef<AbortController | undefined>(undefined);
  const language = HUMAN_LANGUAGES.find(([code]) => code === lang)?.[1] ?? lang;

  const recount = async () => {
    if (!ws || !hash || !path) return;
    const kept = translationsOf(ws, hash);
    await kept.load();
    setCount(epub
      ? await translatedCount(await readBytes(path), kept.of(scope))
      : book ? await translatedCountOfBook(book, kept.of(scope)) : undefined);
  };

  useEffect(() => {
    recount().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, hash, path, scope, book]);

  if (!ws || !hash || !path) return null;
  const kept = translationsOf(ws, hash);

  const translateRest = async () => {
    if (!count) return;
    abort.current = new AbortController();
    setError('');
    setProgress(0);
    try {
      await translateMissing(count.missing, translator, lang, kept, scope, setProgress, abort.current.signal);
    } catch (e) {
      setError(`Stopped: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProgress(undefined);
      await recount();
    }
  };

  const make = async () => {
    setBusy(true);
    setError('');
    try {
      const title = entry?.title ?? 'Book';
      const author = entry?.author ?? '';
      const data = epub
        ? await translatedEpub(await readBytes(path), kept.of(scope), lang, only)
        : await translatedEpubOfBook(book!, kept.of(scope), lang, only, { title, author, language: entry?.language?.[0] });
      const file = await saveTranslatedBook(ws, path, title, author, data, lang);
      setMade(file.split(/[\\/]/).pop() ?? file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const translating = progress !== undefined;
  return (
    <BaseModal title="Translated book" isOpen handleClose={close} panelClassName="max-w-md">
      <div className="flex flex-col gap-3 text-sm text-left" data-testid="translated-book">
        {!count ? (
          error ? null : <Spinner size="sm" className="mx-auto" />
        ) : (
          <p>
            {count.done} of {count.total} paragraphs translated into {language} by {translator.label}.
            {count.missing.length ? ' The others stay as they are in the book.' : ''}
          </p>
        )}
        {translating && count ? (
          <div className="flex items-center gap-2">
            <progress className="flex-1 progress" value={progress} max={count.missing.length} />
            <span className="text-xs tabular-nums">{progress} / {count.missing.length}</span>
            <button className="btn btn-ghost btn-xs" onClick={() => abort.current?.abort()}>Stop</button>
          </div>
        ) : null}
        <p className="text-xs text-base-content/60">
          {only ? 'The translation in place of the text' : 'The translation under each paragraph'} (as the book is shown
          now), saved beside the book as a new EPUB, in the library; the book itself is left as it is.
          {epub ? '' : ' Made of the pages as shown here: some formatting of the book may differ.'}
        </p>
        {error ? <p className="text-error">{error}</p> : null}
        {made ? <p className="text-success">Saved as {made}</p> : null}
        <div className="flex justify-end gap-2">
          {count?.missing.length ? (
            <button className="btn btn-sm" disabled={translating || busy} onClick={() => void translateRest()}
              title="Translate them now: slow, a few at a time">
              Translate the rest
            </button>
          ) : null}
          <button className="btn btn-sm btn-primary" disabled={!count?.done || translating || busy} onClick={() => void make()}>
            {busy ? <Spinner size="xs" /> : null} Make the book
          </button>
        </div>
      </div>
    </BaseModal>
  );
}
