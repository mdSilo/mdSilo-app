import React, { useState, useEffect, useRef, useContext } from "react";
import { IconRefresh, IconSettings } from "@tabler/icons";
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
};

export function ChannelList(props: Props) {
  const { channelList, refreshList, onShowManager, onClickFeed, refreshing, doneNum } = props;
  
  const renderFeedList = (): JSX.Element => {
    return (
      <>
        {channelList.map((channel: ChannelType, idx: number) => {
          const { unread = 0, link } = channel;
          const ico = getFavicon(link);
          console.log("channel", channel);
          return (
            <div 
              key={`${channel.title}-${idx}`}
              className="flex flex-row items-center justify-between cursor-pointer"
              onClick={() => onClickFeed(channel.link)}
            >
              <div className="flex flex-row items-center justify-start">
                <img
                  src={ico}
                  className="h-4 w-4 mx-1"
                  alt=">"
                />
                <span className="">{channel.title}</span>
              </div>
              <span className="">{unread}</span>
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
        {renderFeedList()}
      </div>
    </div>
  );
}
