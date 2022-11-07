import React, { memo, useCallback, useEffect, useState } from "react";
import { IconCircle, IconCircleCheck, IconRefresh } from "@tabler/icons";
import Tooltip from "components/misc/Tooltip";
import Spinner from "components/misc/Spinner";
import { getReadableDatetime } from 'utils/helper';
import { ArticleType, ChannelType } from "./data/dataType";


type Props = {
  channel: ChannelType | null;
  starChannel?: boolean;
  articles: ArticleType[] | null;
  handleRefresh: () => void;
  updateAllReadStatus: (feedLink: string, status: number) => Promise<void>;
  onClickArticle: (article: ArticleType) => void;
  loading: boolean;
  syncing: boolean;
};

export function Channel(props: Props) {
  const { 
    channel, starChannel, articles, handleRefresh, updateAllReadStatus, onClickArticle, loading, syncing 
  } = props;

  // const [articleList, setArticleList] = useState<ArticleType[]>([]);

  if (loading) {
    return (
      <div className="flex items-center justify-center"><Spinner className="w-8 h-8" /></div>
    );
  } else if (!articles) {
    return (<></>);
  }

  return (
    <div className="flex flex-col items-between justify-center">
      <div className="flex flex-row items-center justify-between px-2 bg-gray-300">
        <div className="font-bold">{channel?.title || (starChannel ? 'Starred' : '')}</div>
        {(channel) && (
          <div className="flex flex-row items-center justify-end">
            <Tooltip content="Mark All Read" placement="bottom">
              <button className="" onClick={async () => await updateAllReadStatus(channel.link, 1)}>
                <IconCircleCheck size={18} className="m-1 cursor-pointer" />
              </button>
            </Tooltip>
            <Tooltip content="Refresh Channel" placement="bottom">
              <button className="" onClick={handleRefresh}>
                <IconRefresh size={18} className={`m-1 cursor-pointer ${syncing ? "spinning" : ""}`} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
      {syncing && <div className="flex items-center justify-center"><Spinner className="w-4 h-4" /></div>}
      <ArticleList
        articles={articles}
        onClickArticle={onClickArticle}
      />
    </div>
  );
}

type ListProps = {
  articles: ArticleType[];
  onClickArticle: (article: ArticleType) => void;
};

function ArticleList(props: ListProps) {
  const { articles, onClickArticle } = props;
  const [highlighted, setHighlighted] = useState<ArticleType>();

  const handleArticleSelect = (article: ArticleType) => {
    setHighlighted(article);
    onClickArticle(article);
  };

  const renderList = (): JSX.Element[] => {
    return articles.map((article: ArticleType, idx: number) => {
      return (
        <ArticleItem
          key={`${article.id}=${idx}`}
          article={article}
          highlight={highlighted?.id === article.id}
          onSelect={handleArticleSelect}
        />
      );
    });
  };

  return (
    <div className="">
      {renderList()}
    </div>
  );
}

type ItemProps = {
  article: ArticleType;
  onSelect: (article: ArticleType) => void;
  highlight: boolean;
};

const ArticleItem = memo(function ArticleItm(props: ItemProps) {
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

  const itemClass = `cursor-pointer flex flex-col items-start justify-center my-1 hover:bg-gray-400 ${highlight ? 'bg-blue-400' : ''}`;

  return (
    <div
      className={itemClass}
      onClick={handleClick}
      aria-hidden="true"
    >
      <div className="flex flex-row items-center justify-start">
        {(readStatus === 0) && <IconCircle className="w-2 h-2 m-1 text-blue-500 fill-blue-500" />}
        <div className="flex-1 font-bold m-1">{article.title}</div>
      </div>
      <div className="flex flex-row items-center justify-start">
        <span className="m-1 text-sm">{article.author}</span>
        <span className="m-1 text-sm">{getReadableDatetime(article.published || '')}</span>
      </div>
    </div>
  );
});
