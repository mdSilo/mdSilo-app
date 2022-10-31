import React, { useState, useEffect, useRef, useContext } from "react";
import { IconPlus, IconRefresh } from "@tabler/icons";
import { store } from "lib/store";
import defaultSiteIcon from "./default.png";
import { ChannelType } from "./helpers/dataType";
import { getChannelFavicon } from "./helpers/parseXML";

type Props = {
  channelList: ChannelType[];
  refreshList: () => void;
  refreshing: boolean;
  doneNum: number;
  onClickFeed: (link: string) => void;
};

const ChannelList = (props: Props): JSX.Element => {
  const { channelList, refreshList, onClickFeed, refreshing, doneNum } = props;
  
  const renderFeedList = (): JSX.Element => {
    return (
      <ul className="">
        {channelList.map((channel: ChannelType, i: number) => {
          const { unread = 0, link } = channel;
          const ico = getChannelFavicon(link);

          return (
            <li
              key={channel.title + i}
              onClick={() => onClickFeed(channel.link)}
              aria-hidden="true"
            >
              <div>
                <img
                  src={ico}
                  onError={(e) => {
                    // @ts-ignore
                    e.target.onerror = null;

                    // @ts-ignore
                    e.target.src = defaultSiteIcon;
                  }}
                  className="h-4 w-4"
                  alt={channel.title}
                />
                <span className="">{channel.title}</span>
                {unread > 0 && <span className="">{unread}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  const goToSetting = () => {
    // TODO
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-end">
        <div className="flex flex-end">
          <span className="" onClick={refreshList}>
            <IconRefresh className={`h-4 w-4 ${refreshing ? "spinning" : ""}`} />
          </span>
          <span className="" onClick={goToSetting}>
            <IconPlus className={"h-4 w-4"} />
          </span>
        </div>
      </div>
      <div className="p-10">
        {renderFeedList()}
      </div>
      {refreshing && (
        <div className="">
          <span className="">
            {doneNum}/{channelList.length}
          </span>
        </div>
      )}
    </div>
  );
};

export { ChannelList };
