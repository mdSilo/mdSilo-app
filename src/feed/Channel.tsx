import React, { memo, useEffect, useState } from "react";
import { TbBook2 as IconBook, TbCircle as IconCircle, TbCircleCheck as IconCircleCheck, TbRefresh as IconRefresh } from "react-icons/tb";
import { Spinner, Tooltip } from "@/ui/ui";
import { fmtDatetime, dateCompare } from '@/lib/helper';
import { ArticleType, ChannelType } from "@/types/model";
import { MakeBook } from "./MakeBook";


type Props = {
  channel: ChannelType | null;
  starChannel?: boolean;
  articles: ArticleType[] | null;
  handleRefresh: () => Promise<void>;
  updateAllReadStatus: (feedLink: string, status: number) => Promise<void>;
  onClickArticle: (article: ArticleType) => Promise<void>;
  loading: boolean;
  syncing: boolean;
  /** open a book, e.g. made of the articles */
  onOpenBook?: (path: string) => void;
};

export function Channel(props: Props) {
  const { 
    channel, starChannel, articles, handleRefresh, updateAllReadStatus, onClickArticle, loading, syncing, onOpenBook 
  } = props;
  const [makingBook, setMakingBook] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center"><Spinner /></div>
    );
  } else if (!articles) {
    return (<></>);
  }

  return (
    <div className="flex flex-col items-between justify-center">
      <div className="flex flex-row items-center justify-between p-2 bg-base-300 rounded-sm">
        <div className="font-bold">{channel?.title || (starChannel ? 'Starred' : '')}</div>
        <div className="flex flex-row items-center justify-end">
          {articles.length > 0 && (
            <Tooltip content="Make a book of the articles, or add the new ones to it" placement="bottom">
              <button className="" aria-label="Make a book" onClick={() => setMakingBook((v) => !v)}>
                <IconBook size={18} className="m-1" />
              </button>
            </Tooltip>
          )}
          {(channel) && (<>
            <Tooltip content="Mark All Read" placement="bottom">
              <button className="" onClick={async () => await updateAllReadStatus(channel.link, 1)}>
                <IconCircleCheck size={18} className="m-1" />
              </button>
            </Tooltip>
            <Tooltip content="Refresh Channel" placement="bottom">
              <button className="" onClick={handleRefresh}>
                <IconRefresh size={18} className="m-1" />
              </button>
            </Tooltip>
          </>)}
        </div>
      </div>
      {makingBook && (
        <MakeBook
          defaultName={channel?.title || 'Starred'}
          source={channel?.title}
          articles={articles}
          onOpenBook={onOpenBook}
          onClose={() => setMakingBook(false)}
        />
      )}
      {syncing && <div className="flex items-center justify-center"><Spinner size="xs" /></div>}
      <ArticleList
        articles={articles}
        onClickArticle={onClickArticle}
      />
    </div>
  );
}

type ListProps = {
  articles: ArticleType[];
  onClickArticle: (article: ArticleType) => Promise<void>;
};

function ArticleList(props: ListProps) {
  const { articles, onClickArticle } = props;
  const [highlighted, setHighlighted] = useState<ArticleType>();

  const onArticleSelect = async (article: ArticleType) => {
    setHighlighted(article);
    await onClickArticle(article);
  };

  const sortedArticles = articles.length >= 2 
    ? articles.sort((n1, n2) => {
        return n2.published && n1.published 
          ? dateCompare(n2.published, n1.published)
          : 0;
      })
      .sort((n1, n2) => n1.read_status - n2.read_status)
    : articles;

  // console.log("sorted: ", sortedArticles)

  return (
    <div className="">
      {sortedArticles.map((article: ArticleType, idx: number) => {
        return (
          <ArticleItem
            key={`${article.id}=${idx}`}
            article={article}
            highlight={highlighted?.id === article.id}
            onArticleSelect={onArticleSelect}
          />
        )}
      )}
    </div>
  );
}

type ItemProps = {
  article: ArticleType;
  onArticleSelect: (article: ArticleType) => Promise<void>;
  highlight: boolean;
};

const ArticleItem = memo(function ArticleItm(props: ItemProps) {
  const { article, onArticleSelect, highlight } = props;
  const [readStatus, setReadStatus] = useState(article.read_status);

  const handleClick = async () => {
    if (onArticleSelect) {
      await onArticleSelect(article);
      setReadStatus(1);
    }
  };

  useEffect(() => { setReadStatus(article.read_status); }, [article.read_status])

  const itemClass = `cursor-pointer flex flex-col items-start justify-center my-1 hover:bg-base-content/10 ${highlight ? 'bg-info/15' : ''}`;

  return (
    <div
      className={itemClass}
      onClick={handleClick}
      aria-hidden="true"
    >
      <div className="flex flex-row items-center justify-start">
        {(readStatus === 0) && <IconCircle className="w-2 h-2 m-1 text-info fill-info" />}
        <div className="flex-1 font-bold m-1">{article.title}</div>
      </div>
      <div className="flex flex-row items-center justify-center">
        <span className="m-1 pl-2 text-sm">
          {fmtDatetime(article.published || '')}
        </span>
      </div>
    </div>
  );
});
