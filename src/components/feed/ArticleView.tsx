import React, { useEffect, useRef, useState } from "react";
import { IconLink, IconStar } from "@tabler/icons";
import { getFavicon, getReadableDatetime } from "utils/helper";
import { ArticleType } from "./data/dataType";

type ViewProps = {
  article: ArticleType | null;
};

export function ArticleView(props: ViewProps) {
  const { article } = props;
  const [pageContent, setPageContent] = useState("");
  const [showBanner, setShowBanner] = useState(false);

  const renderPlaceholder = () => {
    return "";
  };

  const renderDetail = () => {
    if (!article) {
      return null;
    }

    const { title, url, author, published, image } = article;
    const ico = getFavicon(url);

    return (
      <div className="">
        <div className="">
          <div className="text-2xl font-bold">{title}</div>
          <div className="flex items-center justify-start">
            <span className="h-4 w-4 m-1"><img src={ico} alt="#"/></span>
            <span className="m-1">
              {getReadableDatetime(published || '')}
            </span>
            <span className="m-1">{author}</span>
            <a
              className="m-1"
              target="_blank"
              rel="noreferrer"
              href={url}
            >
              <IconLink size={18} />
            </a>
            <span className="m-1 cursor-pointer">
              <IconStar size={18} className="text-orange-500" />
            </span>
          </div>
        </div>
        <div className="">
          {showBanner && image &&  <div className=""><img src={image} alt=""/></div>}
          <div
            className="text-lg px-2"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{__html: pageContent}}
          />
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (article) {
      const content = (article.content || article.description || "").replace(
        /<a[^>]+>/gi,
        (a: string) => {
          if (!/\starget\s*=/gi.test(a)) {
            return a.replace(/^<a\s/, '<a target="_blank"');
          }

          return a;
        }
      );

      if (article.image && content.includes(article.image.split('/').slice(-1)[0])){
        setShowBanner(false)
      } else {
        setShowBanner(true)
      }

      setPageContent(content);
    }
  }, [article]);


  return (
    <div className="">
      {article ? renderDetail() : renderPlaceholder()}
    </div>
  );
}
