import React, { useEffect, useState } from "react";
import { IconChevronLeft, IconHeadphones, IconLink, IconStar } from "@tabler/icons-react";
import { useStore } from "lib/store";
import { getFavicon, fmtDatetime } from "utils/helper";
import { ArticleType } from "types/model";
import Tooltip from "components/misc/Tooltip";

type ViewProps = {
  article: ArticleType | null;
  starArticle: (url: string, status: number) => Promise<void>;
  hideChannelCol: () => void;
};

export function ArticleView(props: ViewProps) {
  const { article, starArticle, hideChannelCol } = props;
  const [isStar, setIsStar] = useState(article?.star_status === 1);
  const [pageContent, setPageContent] = useState("");

  const setCurrentPod = useStore(state => state.setCurrentPod);

  useEffect(() => {
    if (article) {
      const content = (article.content || article.description || "").replace(
        /<a[^>]+>/gi,
        (a: string) => {
          return (!/\starget\s*=/gi.test(a)) ? a.replace(/^<a\s/, '<a target="_blank"') : a;
        }
      );

      setPageContent(content);
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
        <div className="m-1 text-3xl font-bold dark:text-white">{title}</div>
        <div className="flex items-center justify-start">
          <span className="mr-2 my-1 cursor-pointer" onClick={hideChannelCol}>
            <IconChevronLeft size={20} className="dark:text-slate-400" />
          </span>
          <Tooltip content={feed_link} placement="top">
            <span className="h-4 w-4 m-1"><img src={ico} alt="#"/></span>
          </Tooltip>
          <span className="m-1 dark:text-slate-400">{fmtDatetime(published || '')}</span>
          <span className="m-1 dark:text-slate-400">{author}</span>
          <a
            className="m-1 dark:text-slate-400"
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
            <IconStar size={20} className={`text-red-500 ${isStar ? 'fill-red-500' : ''}`} />
          </span>
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
          className="text-lg p-2 mt-2 content text-black dark:text-slate-400"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{__html: pageContent}}
        />
      </div>
    </div>
  );
}
