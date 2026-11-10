import { useEffect, useState } from "react";
import { ArticleType } from "@/types/model";
import { Spinner } from "@/ui/ui";
import { t, useT } from "@/i18n";
import {
  saveFeedBook,
  type FeedBookReport,
  type FeedBookStage,
} from "./feedToBook";

type Props = {
  /** the name of the book by default, e.g. the channel's */
  defaultName: string;
  /** shown in each article, e.g. the channel */
  source?: string;
  /** the URL of the feed, if of one: the book of it found by it */
  feedUrl?: string;
  articles: ArticleType[];
  onOpenBook?: (path: string) => void;
  onClose: () => void;
};

/** The progress of making a feed book, as shown. */
export const progressText = (
  done: number,
  total: number,
  stage: FeedBookStage,
) =>
  !total
    ? t("Saving…")
    : stage === "text"
      ? `Fetching the full text ${done}/${total}…`
      : `Fetching the images of the articles ${done}/${total}…`;

export const summaryOf = (r: FeedBookReport) => {
  const parts = [
    r.created
      ? `Made, ${r.added} article(s)`
      : r.added
        ? `${r.added} new article(s) added to "${r.name}"`
        : `No new articles for "${r.name}"`,
    r.fromPage ? `${r.fromPage} full text from the page` : "",
    r.partial
      ? `${r.partial} excerpt(s) only: the full text could not be fetched`
      : "",
    r.refreshed ? `${r.refreshed} excerpt(s) made full` : "",
    `${r.total} in the book`,
  ];
  return parts.filter(Boolean).join(" · ");
};

/** Make a book of the articles, or add the new ones to it. */
export function MakeBook(props: Props) {
  const t = useT();
  const { defaultName, source, feedUrl, articles, onOpenBook, onClose } = props;
  const [name, setName] = useState(defaultName);
  const [progress, setProgress] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<FeedBookReport>();
  const [error, setError] = useState("");

  useEffect(() => {
    setName(defaultName);
    setReport(undefined);
    setError("");
  }, [defaultName]);

  const make = async () => {
    setBusy(true);
    setReport(undefined);
    setError("");
    try {
      setReport(
        await saveFeedBook(name.trim(), articles, {
          source,
          feedUrl,
          onProgress: (done, total, stage) =>
            setProgress(progressText(done, total, stage)),
        }),
      );
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
          aria-label={t("Name of the book")}
          className="input input-sm input-bordered flex-1 min-w-0"
          value={name}
          placeholder={t("Name of the book")}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={make}
          disabled={busy || !name.trim()}
        >
          {busy ? <Spinner size="xs" /> : t("Make")}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={onClose}
          disabled={busy}
        >
          {t("Cancel")}
        </button>
      </div>
      <p className="mt-1 text-base-content/60">
        {t(
          "{count} article(s), each a chapter of the book in reading/. Made again, the book of this feed (or of this name) gets the new articles at its end; the articles in it stay as they are, so do your annotations.",
          { count: articles.length },
        )}
      </p>
      {progress && <p className="mt-1">{progress}</p>}
      {error && <p className="mt-1 text-error">{error}</p>}
      {report && (
        <div className="mt-1 flex flex-row items-center gap-2">
          <span className="flex-1 text-success">{summaryOf(report)}</span>
          {onOpenBook && (
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => onOpenBook(report.path)}
            >
              {t("Open")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
