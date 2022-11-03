import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { IconCircleCheck, IconRefresh } from "@tabler/icons";
import { ArticleType, ChannelType } from "./data/dataType";

type Props = {
  currentFeed: ChannelType | null;
  handleRefresh: () => void;
  markAllRead: () => void;
  onClickArticle: (article: ArticleType) => void;
  syncing: boolean;
};

export const Channel = (props: Props): JSX.Element => {
  const { currentFeed, handleRefresh, markAllRead, onClickArticle, syncing } = props;

  if (!currentFeed) {
    return (
      <div className="">
        no feed
      </div>
    );
  }

  const title = currentFeed.title;
  // const feedUrl = currentFeed.link;
  const articleList = currentFeed.entries; 

  const listRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  return (
    <div className="">
      <div className="" ref={listRef}>
        <div className={`sticky-header`}>
          <div className="title">{title}</div>
          <div className="menu">
            <span className="" onClick={markAllRead}>
              <IconCircleCheck className={"h-4 w-4"} />
            </span>
            <span className="" onClick={handleRefresh}>
              <IconRefresh className={`h-4 w-4 ${syncing ? "spinning" : ""}`} />
            </span>
          </div>
        </div>
        {syncing && <div className="">Sync...</div>}
        <ArticleList
          articles={articleList}
          onClickArticle={onClickArticle}
        />
      </div>
    </div>
  );
};

type ListProps = {
  articles: ArticleType[];
  onClickArticle: (article: ArticleType) => void;
};

const ArticleList = forwardRef((props: ListProps): JSX.Element => {
    const { articles, onClickArticle } = props;
    const [highlightItem, setHighlightItem] = useState<ArticleType>();
    const articleListRef = useRef<HTMLDivElement>(null);

    const handleArticleSelect = (article: ArticleType) => {
      setHighlightItem(article);
      onClickArticle(article);
    };

    const renderList = (): JSX.Element[] => {
      return articles.map((article: any, idx: number) => {
        return (
          <ArticleItem
            article={article}
            highlight={highlightItem?.id === article.id}
            key={article.id}
            onSelect={handleArticleSelect}
          />
        );
      });
    };

    return (
      <div className="">
        <div className="" ref={articleListRef}>
          <ul className="">{renderList()}</ul>
        </div>
      </div>
    );
  }
);

type ItemProps = {
  article: ArticleType;
  onSelect: (article: ArticleType) => void;
  highlight: boolean;
};

const ArticleItem = React.memo((props: ItemProps) => {
  const { article, onSelect, highlight } = props;
  const [readStatus, setReadStatus] = useState(article.read_status);

  const handleClick = async (e: any) => {
    if (onSelect) {
      onSelect(article);
    }

    // need to: nav to article view, set read status, update unread_num
  };

  useEffect(() => {
    setReadStatus(article.read_status)
  }, [article.read_status])

  return (
    <li
      className={`${readStatus === 2 ? "" : ""} ${highlight ? "" : ""}`}
      onClick={handleClick}
      aria-hidden="true"
    >
      {(readStatus === 1) && <div className={""} />}
      <div className="">
        <div className="titleText">
          {highlight} {article.title}
        </div>
      </div>
      
      <div className={"meta"}>
        <div>{article.author}</div>
        <div className={"date"}>
          {article.published}
        </div>
      </div>
    </li>
  );
});