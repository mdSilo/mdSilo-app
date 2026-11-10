import React, { useState } from "react";
import {
  TbHeadphones,
  TbRefresh,
  TbRss,
  TbSettings,
  TbStar,
} from "react-icons/tb";
import { ImLibrary, ImBooks } from "react-icons/im";
import { getFavicon } from "@/lib/helper";
import { Spinner, Tooltip } from "@/ui/ui";
import { ChannelType } from "@/types/model";
import { useT } from "@/i18n";

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
  const t = useT();
  const {
    channelList,
    refreshList,
    onShowManager,
    onClickFeed,
    onClickStar,
    refreshing,
    doneNum,
  } = props;

  const [highlighted, setHighlighted] = useState<ChannelType>();

  // the OPDS catalogs on top, apart from the feeds
  const catalogs = channelList.filter((c) => c.ty === "opds");
  const feeds = channelList.filter((c) => c.ty !== "opds");

  const renderCatalogList = (): JSX.Element | null => {
    if (catalogs.length === 0) return null;
    return (
      <div className="mb-2 pb-1 border-b border-base-300">
        <div className="flex flex-row items-center p-1">
          <ImLibrary size={18} className="m-1" />
          <span className="m-1">{t("Catalogs")}</span>
        </div>
        {catalogs.map((channel: ChannelType, idx: number) => {
          const { title, link } = channel;
          const activeClass = `${highlighted?.link === link ? "border-l-2 border-primary" : ""}`;
          return (
            <div
              key={`${link}-${idx}`}
              className={`m-1 pl-1 flex flex-row items-center whitespace-nowrap cursor-pointer ${activeClass}`}
              onClick={() => {
                onClickFeed(link);
                setHighlighted(channel);
              }}
            >
              <Tooltip content={link} placement="top">
                <div className="flex flex-row items-center justify-start mr-1">
                  {/* no favicon: a catalog may be private, e.g. on the local network */}
                  <ImBooks size={16} className="flex-none mx-1 opacity-70" />
                  <span className="text-sm text-base-content">{title}</span>
                </div>
              </Tooltip>
            </div>
          );
        })}
      </div>
    );
  };

  const renderFeedList = (): JSX.Element => {
    return (
      <>
        {feeds.map((channel: ChannelType, idx: number) => {
          const { unread = 0, title, ty, link } = channel;
          const ico = getFavicon(link);
          const activeClass = `${highlighted?.link === link ? "border-l-2 border-primary" : ""}`;

          return (
            <div
              key={`${title}-${idx}`}
              className={`m-1 flex flex-row items-center justify-between whitespace-nowrap cursor-pointer ${activeClass}`}
              onClick={() => {
                onClickFeed(link);
                setHighlighted(channel);
              }}
            >
              <Tooltip content={channel.link} placement="top">
                <div className="flex flex-row items-center justify-start mr-1">
                  <img src={ico} className="flex-none h-4 w-4 mx-1" alt=">" />
                  <span className="text-sm text-base-content">{title}</span>
                </div>
              </Tooltip>
              {/* stick to the visible right edge when the list scrolls horizontally */}
              <span className="sticky right-0 flex flex-none items-center justify-between pl-1 bg-base-100">
                <span className="text-sm">{unread}</span>
                {ty === "rss" ? (
                  <TbRss size={12} className="ml-1 text-orange-500" />
                ) : (
                  <TbHeadphones size={12} className="ml-1 text-secondary" />
                )}
              </span>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-none items-center justify-between bg-base-300 p-1">
        <span className="px-1 font-bold truncate">{t("Channels")}</span>
        <div className="flex flex-end">
          <Tooltip content={t("Refresh All")} placement="bottom">
            <button className="cursor-pointer" onClick={refreshList}>
              <TbRefresh size={24} className="m-1" />
            </button>
          </Tooltip>
          <Tooltip
            content={t("Manage Channels and Settings")}
            placement="bottom"
          >
            <button className="cursor-pointer" onClick={onShowManager}>
              <TbSettings size={24} className="m-1" />
            </button>
          </Tooltip>
        </div>
      </div>
      {refreshing && (
        <div className="flex flex-col items-center justify-center">
          <Spinner size="xs" />
          <span className="">
            {doneNum}/{feeds.length}
          </span>
        </div>
      )}
      {/* long feed titles do not wrap: the list scrolls horizontally */}
      <div className="flex-1 overflow-auto" data-testid="channel-list-scroller">
        {/* as wide as the longest title, at least the column */}
        <div className="p-1 w-max min-w-full">
          {renderCatalogList()}
          <div
            className="flex flex-row items-center justify-between cursor-pointer"
            onClick={onClickStar}
          >
            <div className="flex flex-row items-center justify-start">
              <TbStar size={18} className="m-1 fill-warning text-warning" />
              <span className="m-1">{t("Starred")}</span>
            </div>
          </div>
          {renderFeedList()}
        </div>
      </div>
    </div>
  );
}
