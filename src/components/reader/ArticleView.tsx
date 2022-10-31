import React, { useEffect, useRef, useState } from "react";
import { getChannelFavicon } from "./helpers/parseXML";
import { ArticleType } from "./helpers/dataType";
import { IconLink, IconStar } from "@tabler/icons";

type ViewProps = {
  article?: ArticleType;
};


export const ArticleView = (props: ViewProps): JSX.Element => {
  const { article } = props;
  const containerRef = useRef<HTMLDivElement>(null);
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
    const ico = getChannelFavicon(url);

    return (
      <div className="" ref={containerRef}>
        <div className="">
          <div className="">
            <div className="">{title}</div>
            <div className="meta">
              <span className="">
                <img src={ico} alt=""/>
              </span>
              <span className="">
                {published}
              </span>
              <span className="">{author}</span>
              <a
                className=""
                target="_blank"
                rel="noreferrer"
                href={url}
              >
                <IconLink className={"h-4 w-4"} />
              </a>
              <span className="">
                <IconStar className={"h-4 w-4"} />
              </span>
            </div>
          </div>
          <div className="">
            {showBanner && image &&  <div className=""><img src={image} alt=""/></div>}
            <div
              className=""
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{__html: pageContent}}
            />
          </div>
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
};
