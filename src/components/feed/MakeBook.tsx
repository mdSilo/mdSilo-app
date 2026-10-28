import { useEffect, useState } from 'react';
import { ArticleType } from '@/types/model';
import { Spinner } from '@/ui/ui';
import { saveFeedBook, type FeedBookReport } from './feedToBook';

type Props = {
  /** the name of the book by default, e.g. the channel's */
  defaultName: string;
  /** shown in each article, e.g. the channel */
  source?: string;
  articles: ArticleType[];
  onOpenBook?: (path: string) => void;
  onClose: () => void;
};

const summaryOf = (r: FeedBookReport) => {
  const parts = [
    r.created ? `Made, ${r.added} article(s)` : r.added ? `${r.added} new article(s) added` : 'No new articles',
    r.fromPage ? `${r.fromPage} full text from the page` : '',
    r.partial ? `${r.partial} excerpt(s) only: the full text could not be fetched` : '',
    r.refreshed ? `${r.refreshed} excerpt(s) made full` : '',
    `${r.total} in the book`,
  ];
  return parts.filter(Boolean).join(' · ');
};

/** Make a book of the articles, or add the new ones to it. */
export function MakeBook(props: Props) {
  const { defaultName, source, articles, onOpenBook, onClose } = props;
  const [name, setName] = useState(defaultName);
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<FeedBookReport>();
  const [error, setError] = useState('');

  useEffect(() => {
    setName(defaultName);
    setReport(undefined);
    setError('');
  }, [defaultName]);

  const make = async () => {
    setBusy(true);
    setReport(undefined);
    setError('');
    try {
      setReport(await saveFeedBook(name.trim(), articles, {
        source,
        onProgress: (done, total) => setProgress({ done, total }),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  };

  return (
    <div className="p-2 my-1 rounded-sm bg-base-200 text-sm">
      <div className="flex flex-row items-center gap-2">
        <input
          type="text"
          aria-label="Name of the book"
          className="input input-sm input-bordered flex-1 min-w-0"
          value={name}
          placeholder="Name of the book"
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
        <button type="button" className="btn btn-sm btn-primary" onClick={make} disabled={busy || !name.trim()}>
          {busy ? <Spinner size="xs" /> : 'Make'}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
      <p className="mt-1 text-base-content/60">
        {articles.length} article(s), each a chapter of the book in reading/. Made again, a book of this name gets
        the new articles at its end; the articles in it stay as they are, so do your annotations.
      </p>
      {progress && progress.total > 0 && (
        <p className="mt-1">Fetching the full text {progress.done}/{progress.total}…</p>
      )}
      {error && <p className="mt-1 text-error">{error}</p>}
      {report && (
        <div className="mt-1 flex flex-row items-center gap-2">
          <span className="flex-1 text-success">{summaryOf(report)}</span>
          {onOpenBook && (
            <button type="button" className="btn btn-xs btn-outline" onClick={() => onOpenBook(report.path)}>Open</button>
          )}
        </div>
      )}
    </div>
  );
}
