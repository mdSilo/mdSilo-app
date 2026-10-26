import React, { useEffect, useRef, useState } from "react";
import { TbChevronLeft as IconChevronLeft, TbHeadphones as IconHeadphones, TbLink as IconLink, TbStar as IconStar, TbClipboardText as IconClip } from "react-icons/tb";
import { useStore } from "lib/store";
import { getFavicon, fmtDatetime } from "utils/helper";
import { sanitizeHtml } from "utils/sanitize";
import { ArticleType } from "types/model";
import Tooltip from "components/misc/Tooltip";
import { clipArticle } from "./clip";

type ViewProps = {
  article: ArticleType | null;
  starArticle: (url: string, status: number) => Promise<void>;
  hideChannelCol: () => void;
  /** open a note, e.g. the clip of the article */
  onOpenNote?: (noteId: string) => void;
};

/** The HTML of the selection if it is in the element. */
function selectionHtmlIn(el: HTMLElement | null): string | undefined {
  const sel = window.getSelection();
  if (!el || !sel || sel.isCollapsed || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return;
  const div = document.createElement('div');
  div.append(range.cloneContents());
  return div.innerHTML;
}

export function ArticleView(props: ViewProps) {
  const { article, starArticle, hideChannelCol, onOpenNote } = props;
  const contentRef = useRef<HTMLDivElement>(null);
  const [clipMsg, setClipMsg] = useState("");

  useEffect(() => {
    if (!clipMsg) return;
    const timer = setTimeout(() => setClipMsg(""), 3000);
    return () => clearTimeout(timer);
  }, [clipMsg]);
  const [isStar, setIsStar] = useState(article?.star_status === 1);
  const [pageContent, setPageContent] = useState("");

  const setCurrentPod = useStore(state => state.setCurrentPod);

  useEffect(() => {
    if (article) {
      // from the feed: sanitize, links open outside the app
      setPageContent(sanitizeHtml(article.content || article.description || ""));
      setIsStar(article.star_status === 1);
    }
  }, [article]);

  if (!article) {
    return (
      <div className=""></div>
    );
  }

  const { title, url, feed_link, author, published } = article;
  const ico = getFavicon(url);

  return (
    <div className="h-full ">
      <div className="px-2 mb-1">
        <div className="m-1 text-3xl font-bold">{title}</div>
        <div className="flex items-center justify-start">
          <span className="mr-2 my-1 cursor-pointer" onClick={hideChannelCol}>
            <IconChevronLeft size={20} className="" />
          </span>
          <Tooltip content={feed_link} placement="top">
            <span className="h-4 w-4 m-1"><img src={ico} alt="#"/></span>
          </Tooltip>
          <span className="m-1">{fmtDatetime(published || '')}</span>
          <span className="m-1">{author}</span>
          <a
            className="m-1"
            target="_blank"
            rel="noreferrer"
            href={url}
          >
            <IconLink size={20} />
          </a>
          <span 
            className="m-1 cursor-pointer" 
            onClick={async () => {
              await starArticle(article.url, Math.abs(article.star_status - 1));
              setIsStar(!isStar);
            }}
          >
            <IconStar size={20} className={`text-error ${isStar ? 'fill-error' : ''}`} />
          </span>
          <Tooltip content="Save as a note, or add the selected text to it" placement="top">
            <button
              type="button"
              aria-label="Clip"
              className="m-1"
              // keep the selection in the article
              onMouseDown={(e) => e.preventDefault()}
              onClick={async () => {
                const selection = selectionHtmlIn(contentRef.current);
                const notePath = await clipArticle(article, selection);
                if (!notePath) {
                  setClipMsg("Open a folder to save clips");
                } else if (selection === undefined) {
                  onOpenNote?.(notePath);
                } else {
                  setClipMsg(`Clipped to ${notePath.split('/').pop()}`);
                }
              }}
            >
              <IconClip size={20} />
            </button>
          </Tooltip>
          {clipMsg && <span className="m-1 text-sm text-success">{clipMsg}</span>}
          {article.audio_url.trim() && (
            <span 
              className="m-1 cursor-pointer" 
              onClick={() => setCurrentPod(
                {title, url: article.audio_url, published: article.published, article_url: article.url, feed_link: article.feed_link}
              )}
            >
              <IconHeadphones size={20} color="purple" />
            </span>
          )}
        </div>
      </div>
      <div className="p-2">
        <div
          ref={contentRef}
          className="text-lg p-2 mt-2 content text-base-content"
          dangerouslySetInnerHTML={{__html: pageContent}}
        />
      </div>
    </div>
  );
}
