import React, { useState } from "react";
import { IconHeadphones, IconRefresh, IconRss, IconSettings, IconStar } from "@tabler/icons";
import { getFavicon } from "utils/helper";
import Tooltip from "components/misc/Tooltip";
import Spinner from "components/misc/Spinner";
import { ChannelType } from "./data/dataType";

type Props = {
  channelList: ChannelType[];
  refreshList: () => Promise<void>;
  onShowManager: () => void;
  refreshing: boolean;
  doneNum: number;
  onClickFeed: (link: string) => Promise<void>;
  onClickStar: () => Promise<void>;
};

export function ChannelList(props: Props) {
  const { channelList, refreshList, onShowManager, onClickFeed, onClickStar, refreshing, doneNum } = props;

  const [highlighted, setHighlighted] = useState<ChannelType>();
  
  const renderFeedList = (): JSX.Element => {
    return (
      <>
        {channelList.map((channel: ChannelType, idx: number) => {
          const { unread = 0, title, ty, link } = channel;
          const ico = getFavicon(link);
          const activeClass = `${highlighted?.link === link ? 'border-l-2 border-green-500' : ''}`;
          
          return (
            <div 
              key={`${title}-${idx}`}
              className={`m-1 flex flex-row items-center justify-between cursor-pointer ${activeClass}`}
              onClick={() => {
                onClickFeed(link);
                setHighlighted(channel);
              }}
            >
              <div className="flex flex-row items-center justify-start mr-1">
                <img
                  src={ico}
                  className="h-4 w-4 mx-1"
                  alt=">"
                />
                <span className="text-sm">{title}</span>
              </div>
              <span className="flex items-center justify-between">
                {unread}
                {ty === 'rss' 
                  ? <IconRss size={12} className="ml-1 text-orange-500" /> 
                  : <IconHeadphones size={12} className="ml-1 text-purple-500" />
                }
              </span>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end">
        <div className="flex flex-end">
          <Tooltip content="Refresh All" placement="bottom">
            <button className="cursor-pointer" onClick={refreshList}>
              <IconRefresh size={24} className={`m-1 ${refreshing ? "spinning" : ""}`} />
            </button>
          </Tooltip>
          <Tooltip content="Manage Channel" placement="bottom">
            <button className="cursor-pointer" onClick={onShowManager}>
              <IconSettings size={24} className="m-1" />
            </button>
          </Tooltip>
        </div>
      </div>
      {refreshing && (
        <div className="flex flex-col items-center justify-center">
          <Spinner className="w-4 h-4" />
          <span className="">{doneNum}/{channelList.length}</span>
        </div>
      )}
      <div className="p-1">
        <div 
          className="flex flex-row items-center justify-between cursor-pointer"
          onClick={onClickStar}
        >
          <div className="flex flex-row items-center justify-start">
            <IconStar size={18} className="m-1 fill-yellow-500 text-yellow-500" />
            <span className="m-1">Starred</span>
          </div>
        </div>
        {renderFeedList()}
      </div>
    </div>
  );
}
