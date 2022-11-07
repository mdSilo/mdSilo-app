import React, { useEffect, useState } from "react";
import { IconPlus, IconTrash } from "@tabler/icons";
import Tooltip from "components/misc/Tooltip";
import * as dataAgent from "./data/dataAgent";
import { ChannelType } from "./data/dataType";


type Props = {
  channelList: ChannelType[];
  handleAddFeed: (url: string, title: string) => Promise<void>;
  handleDelete: (channel: ChannelType) => Promise<void>;
  handleImport?: () => void;
  handleExport?: () => void;
};

export function FeedManager(props: Props) {
  const { channelList, handleAddFeed, handleDelete } = props;

  const [realList, setRealList] = useState<ChannelType[]>(channelList);
  const [showAdd, setShowAdd] = useState(false);
  const [searchText, setSearchText] = useState<string>("");

  const [feedUrl, setFeedUrl] = useState("https://www.propublica.org/feeds/propublica/main");
  const [feedTitle, setFeedTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleLoad = async () => {
    setLoading(true);
    const res = await dataAgent.fetchFeed(feedUrl);
    console.log("res from rust", res);
    if (!res) {
      setDescription('Cant find any feed, please check url');
      return;
    }
    const { channel } = res;
    setFeedTitle(channel.title);
    setDescription(channel.description || '');
    setLoading(false);
  };

  const handleCancel = () => {
    setLoading(false);
    setConfirming(false);
    setFeedTitle("");
    setFeedUrl("");
    setDescription("");
    setShowAdd(false);
  };

  const handleSave = async () => {
    await handleAddFeed(feedUrl, feedTitle);
    setConfirming(false);
    setShowAdd(false);
  };

  const handleSearch = (txt: string) => {
    if (txt) {
      const result = channelList.filter((item) => {
        return item.title.indexOf(txt) > -1 || item.link.indexOf(txt) > -1
      })
      setRealList(result);
    } else {
      setRealList(channelList);
    }
  };

  return (
    <div className="flex flex-col items-start justify-center p-2">
      {showAdd && (
        <div className="flex flex-col w-full p-4 outline outline-2 outline-offset-2 outline-green-500">
          <div className="flex flex-row items-center justify-start w-full">
            <div className="">URL</div>
            <div className="w-full">
              <input
                type="text"
                className="w-full p-1 mx-2 bg-white border-gray-200 rounded dark:bg-gray-700 dark:border-gray-700"
                placeholder="Feed URL"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="flex flex-row items-center justify-start w-full">
            <div className="">Title</div>
            <div className="w-full">
              <input
                type="text"
                className="w-full p-1 mx-2 my-2 bg-white border-gray-200 rounded dark:bg-gray-700 dark:border-gray-700"
                placeholder="Feed Title"
                value={feedTitle}
                onChange={(e) => setFeedTitle(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="w-full">{description}</div>
          <div className="flex flex-row">
            <button className="m-1 m-btn0" onClick={handleLoad}>{loading ? 'Loading...' : 'Load'}</button>
            <button className="m-1 m-btn1" onClick={handleCancel}>Cancel</button>
            <button className="m-1 m-btn2" onClick={handleSave}>{confirming ? 'Saving..' : 'OK'}</button>
          </div>
        </div>
      )}
      <div className="flex flex-row items-center justify-between w-full mt-2">
        <Tooltip content="Toggle Add Feed" placement="bottom">
          <button
            className="px-2 py-1 text-sm text-black rounded bg-primary-200 hover:bg-primary-100"
            onClick={() => setShowAdd(!showAdd)}
          >
            <IconPlus size={15} className="" />
          </button>
        </Tooltip>
        <div className="">
          <input
            type="text"
            className="p-2 m-2 bg-white border-gray-200 rounded dark:bg-gray-700 dark:border-gray-700"
            placeholder="Search Feed"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              handleSearch(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch(searchText);
              }
            }}
          />
        </div>
      </div>
      <div className="w-full flex flex-col items-between justify-center border-t-2 border-gray-500 my-4">
        {realList.map((channel: ChannelType, idx: number) => {
          return (
            <div key={idx} className="flex items-center justify-between m-1">
              <span>{channel.title}</span>
              <span>{channel.link}</span>
              <button className="cursor-pointer" onClick={async () => await handleDelete(channel)}>
                <IconTrash size={18} className="m-1" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  );
}

// TODO: import/export OPML, EDIT FEED