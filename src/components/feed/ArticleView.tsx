import React, { useEffect, useState } from "react";
import { IconLink, IconStar } from "@tabler/icons";
import { useStore } from "lib/store";
import { getFavicon, fmtDatetime } from "utils/helper";
import { ArticleType } from "./data/dataType";

type ViewProps = {
  article: ArticleType | null;
  starArticle: (url: string, status: number) => Promise<void>;
};

export function ArticleView(props: ViewProps) {
  const { article, starArticle } = props;
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

  const { title, url, author, published } = article;
  const ico = getFavicon(url);

  return (
    <div className="border-l-2 border-gray-500">
      <div className="sticky top-0 px-2 mb-2 bg-gray-200 dark:bg-gray-600">
        <div className="text-3xl font-bold">{title}</div>
        <div className="flex items-center justify-start">
          <span className="h-4 w-4 m-1"><img src={ico} alt="#"/></span>
          <span className="m-1 dark:text-slate-400">{fmtDatetime(published || '')}</span>
          <span className="m-1 dark:text-slate-400">{author}</span>
          <a
            className="m-1 dark:text-slate-400"
            target="_blank"
            rel="noreferrer"
            href={url}
          >
            <IconLink size={18} />
          </a>
          <span 
            className="m-1 cursor-pointer" 
            onClick={async () => {
              await starArticle(article.url, Math.abs(article.star_status - 1));
              setIsStar(!isStar);
            }}
          >
            <IconStar size={18} className={`text-red-500 ${isStar ? 'fill-red-500' : ''}`} />
          </span>
        </div>
      </div>
      <div className="p-2">
        {article.audio_url.trim() && (
          <audio 
            controls 
            src={article.audio_url} 
            onPlay={() => setCurrentPod({title, url: article.audio_url, published: article.published})}
          />
        )}
        <div
          className="text-lg px-2 content text-black dark:text-slate-400"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{__html: pageContent}}
        />
      </div>
    </div>
  );
}
