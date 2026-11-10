import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  TbArrowLeft as IconBack,
  TbBook2 as IconBook,
  TbChevronLeft as IconPrev,
  TbChevronRight as IconNext,
  TbCircleCheck as IconDownloaded,
  TbDownload as IconDownload,
  TbExternalLink as IconExternal,
  TbFolder as IconFolder,
  TbHome as IconHome,
  TbRefresh as IconRefresh,
  TbSearch as IconSearch,
} from "react-icons/tb";
import { Spinner, Tooltip } from "@/ui/ui";
import { sanitizeHtml } from "@/lib/sanitize";
import { ChannelType } from "@/types/model";
import { useT } from "@/i18n";
import {
  downloadBook,
  downloadedBooks,
  loadCatalog,
  searchCatalog,
  type OpdsAcquisition,
  type OpdsEntry,
  type OpdsFeed,
} from "./opds";

type Props = {
  channel: ChannelType;
  onOpenBook?: (path: string) => void;
};

/** A page of the catalog: by its URL, or a search in it. */
type Page = { url: string } | { query: string; from: OpdsFeed };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Browse, search an OPDS catalog and download its books. */
export function OpdsBrowser(props: Props) {
  const t = useT();
  const { channel, onOpenBook } = props;
  // the pages gone through, the last one shown
  const [pages, setPages] = useState<Page[]>([{ url: channel.link }]);
  const [feed, setFeed] = useState<OpdsFeed>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  // the catalog's search, of its first page: not all pages link to it
  const [rootFeed, setRootFeed] = useState<OpdsFeed>();
  const [downloaded, setDownloaded] = useState<Map<string, string>>(new Map());

  // a new catalog is a new browser: keyed by its link, see FeedView
  const page = pages[pages.length - 1];

  const refreshDownloaded = useCallback(() => {
    downloadedBooks()
      .then(setDownloaded)
      .catch((e) => console.warn("Failed to read the library", e));
  }, []);
  useEffect(refreshDownloaded, [refreshDownloaded]);

  const load = useCallback(async (p: Page) => {
    setLoading(true);
    setError("");
    try {
      const search = "query" in p ? p.from.search : undefined;
      const loaded =
        "url" in p
          ? await loadCatalog(p.url)
          : search
            ? await searchCatalog(search, p.query)
            : undefined;
      setFeed(loaded);
      if ("url" in p) setRootFeed((root) => root ?? loaded);
    } catch (e) {
      setFeed(undefined);
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [page, load]);

  const go = (url: string) => setPages((ps) => [...ps, { url }]);
  const back = () => setPages((ps) => (ps.length > 1 ? ps.slice(0, -1) : ps));
  const home = () => setPages([{ url: channel.link }]);
  // the search of this page, else of the catalog
  const searchFrom = feed?.search ? feed : rootFeed;
  const search = () => {
    const q = query.trim();
    if (q && searchFrom?.search)
      setPages((ps) => [...ps, { query: q, from: searchFrom }]);
  };

  const title =
    "query" in page
      ? `Search: ${page.query}`
      : feed?.title || channel.title || channel.link;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-none flex-row flex-wrap items-center gap-1 p-2 bg-base-300 rounded-sm">
        <Tooltip content={t("Back")} placement="bottom">
          <button
            className="btn btn-ghost btn-xs"
            aria-label={t("Back")}
            disabled={pages.length < 2}
            onClick={back}
          >
            <IconBack size={18} />
          </button>
        </Tooltip>
        <Tooltip content={t("Catalog home")} placement="bottom">
          <button
            className="btn btn-ghost btn-xs"
            aria-label={t("Catalog home")}
            onClick={home}
          >
            <IconHome size={18} />
          </button>
        </Tooltip>
        <div className="flex-1 min-w-0 font-bold truncate" title={title}>
          {title}
        </div>
        {searchFrom?.search && (
          <form
            className="flex flex-row items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <input
              type="search"
              aria-label={t("Search the catalog")}
              className="input input-xs input-bordered w-40"
              placeholder={t("Search books")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-ghost btn-xs"
              aria-label={t("Search")}
            >
              <IconSearch size={18} />
            </button>
          </form>
        )}
        <Tooltip content={t("Reload")} placement="bottom">
          <button
            className="btn btn-ghost btn-xs"
            aria-label={t("Reload")}
            onClick={() => {
              void load(page);
              refreshDownloaded();
            }}
          >
            <IconRefresh size={18} />
          </button>
        </Tooltip>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {loading ? (
          <div className="flex items-center justify-center p-4">
            <Spinner />
          </div>
        ) : error ? (
          <div className="p-4 text-error text-sm">{error}</div>
        ) : feed ? (
          <>
            {feed.subtitle && "url" in page && (
              <div className="p-2 text-sm opacity-70">{feed.subtitle}</div>
            )}
            {feed.entries.length === 0 && (
              <div className="p-4 text-sm opacity-70">{t("Nothing here")}</div>
            )}
            {feed.entries.map((entry, idx) => (
              <div key={`${entry.id}-${idx}`}>
                {entry.group &&
                  entry.group !== feed.entries[idx - 1]?.group && (
                    <div className="mt-3 mb-1 px-2 font-bold text-sm">
                      {entry.group}
                    </div>
                  )}
                {entry.nav ? (
                  <NavItem entry={entry} onGo={go} />
                ) : (
                  <BookItem
                    entry={entry}
                    downloadedPath={downloaded.get(entry.id)}
                    onDownloaded={refreshDownloaded}
                    onOpenBook={onOpenBook}
                  />
                )}
              </div>
            ))}
            {(feed.prev || feed.next) && (
              <div className="flex flex-row items-center justify-center gap-2 p-2">
                <button
                  className="btn btn-sm"
                  disabled={!feed.prev}
                  onClick={() => feed.prev && go(feed.prev)}
                >
                  <IconPrev size={16} /> {t("Previous")}
                </button>
                <button
                  className="btn btn-sm"
                  disabled={!feed.next}
                  onClick={() => feed.next && go(feed.next)}
                >
                  {t("Next")} <IconNext size={16} />
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function NavItem(props: { entry: OpdsEntry; onGo: (url: string) => void }) {
  const { entry, onGo } = props;
  return (
    <button
      className="w-full flex flex-row items-center gap-2 p-2 text-left rounded-sm hover:bg-base-content/10"
      onClick={() => entry.nav && onGo(entry.nav.href)}
    >
      <IconFolder size={18} className="flex-none text-primary" />
      <span className="flex-1 min-w-0">
        <span className="block truncate">{entry.title}</span>
        {entry.summary && (
          <span className="block text-xs opacity-70 truncate">
            {entry.summary.replace(/<[^>]+>/g, " ")}
          </span>
        )}
      </span>
      <IconNext size={16} className="flex-none opacity-60" />
    </button>
  );
}

type BookProps = {
  entry: OpdsEntry;
  /** the book file, if downloaded */
  downloadedPath?: string;
  onDownloaded: () => void;
  onOpenBook?: (path: string) => void;
};

function BookItem(props: BookProps) {
  const t = useT();
  const { entry, downloadedPath, onDownloaded, onOpenBook } = props;
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  const download = async (acq: OpdsAcquisition) => {
    setBusy(acq.href);
    setError("");
    try {
      await downloadBook(entry, acq);
      onDownloaded();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(undefined);
    }
  };

  const meta = [entry.publisher, entry.published?.slice(0, 10), entry.language]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-row gap-3 p-2 my-1 rounded-sm hover:bg-base-content/5">
      <Cover src={entry.thumbnail} />
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="font-bold">{entry.title}</div>
        {entry.authors.length > 0 && (
          <div className="text-sm">{entry.authors.join(", ")}</div>
        )}
        {meta && <div className="text-xs opacity-70">{meta}</div>}
        {entry.subjects.length > 0 && (
          <div className="flex flex-row flex-wrap gap-1">
            {entry.subjects.slice(0, 6).map((s) => (
              <span key={s} className="badge badge-ghost badge-sm">
                {s}
              </span>
            ))}
          </div>
        )}
        {entry.summary && (
          <div
            className={`text-sm opacity-80 cursor-pointer ${expanded ? "" : "line-clamp-3"}`}
            onClick={() => setExpanded((v) => !v)}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(entry.summary) }}
          />
        )}
        <div className="flex flex-row flex-wrap items-center gap-1 mt-1">
          {downloadedPath && (
            <>
              <span className="badge badge-success badge-sm gap-1">
                <IconDownloaded size={12} /> {t("Downloaded")}
              </span>
              {onOpenBook && (
                <button
                  className="btn btn-primary btn-xs"
                  onClick={() => onOpenBook(downloadedPath)}
                >
                  <IconBook size={14} /> {t("Open")}
                </button>
              )}
            </>
          )}
          {entry.acquisitions.map((acq) => (
            <Tooltip
              key={acq.href}
              content={
                acq.title ||
                t("Download {format} to reading/", {
                  format: acq.ext.toUpperCase(),
                })
              }
              placement="top"
            >
              <button
                className="btn btn-xs"
                disabled={Boolean(busy)}
                onClick={() => download(acq)}
              >
                {busy === acq.href ? (
                  <Spinner size="xs" />
                ) : (
                  <IconDownload size={14} />
                )}
                {acq.ext.toUpperCase()}
              </button>
            </Tooltip>
          ))}
          {entry.acquisitions.length === 0 &&
            entry.external.map((link) => (
              <a
                key={link.href}
                className="btn btn-ghost btn-xs"
                href={link.href}
                target="_blank"
                rel="noreferrer"
              >
                <IconExternal size={14} /> {link.title || t("Get it")}
              </a>
            ))}
        </div>
        {error && <div className="text-xs text-error">{error}</div>}
      </div>
    </div>
  );
}

/**
 * The cover of a book: an https image shown as it is; others (e.g. http of a
 * catalog on the local network) fetched, as the app loads https only.
 */
function Cover(props: { src?: string }) {
  const { src } = props;
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!src || src.startsWith("https:") || src.startsWith("data:")) {
      setUrl(src);
      return;
    }
    let blobUrl: string | undefined;
    let cancelled = false;
    invoke<ArrayBuffer | Uint8Array>("fetch_url", { url: src })
      .then((data) => {
        if (cancelled) return;
        blobUrl = URL.createObjectURL(new Blob([data as BlobPart]));
        setUrl(blobUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [src]);

  return (
    <div className="flex-none w-16 h-24 rounded-sm bg-base-300 overflow-hidden flex items-center justify-center">
      {url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <IconBook size={24} className="opacity-40" />
      )}
    </div>
  );
}
