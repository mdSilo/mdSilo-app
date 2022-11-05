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
    setDescription(channel.description);
    setLoading(false);
  };

  const handleCancel = () => {
    setLoading(false);
    setConfirming(false);
    setFeedTitle("");
    setFeedUrl("");
  };

  const handleSave = async () => {
    await handleAddFeed(feedUrl, feedTitle);
    setConfirming(false);
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
    <div className="flex flex-col items-center justify-start p-2 w-full">
      <div className="flex flex-row items-center justify-start">
        <Tooltip content="Toggle Add Feed" placement="bottom">
          <button
            className=""
            onClick={() => setShowAdd(!showAdd)}
          >
            <IconPlus size={15} className="" />
          </button>
        </Tooltip>
        <div className="flex-1">
          <input
            type="text"
            className="py-1 mx-4 my-2 bg-white border-gray-200 rounded dark:bg-gray-700 dark:border-gray-700"
            placeholder="Search Feed "
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch(searchText);
              }
            }}
          />
        </div>
      </div>
      {showAdd && (
        <div className="flex flex-col">
          <div className="flex flex-row items-center justify-start">
            <div className="">URL</div>
            <div className="">
              <input
                type="text"
                className="w-full py-1 mx-4 my-2 bg-white border-gray-200 rounded dark:bg-gray-700 dark:border-gray-700"
                placeholder="Feed URL"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                autoFocus
              />
            </div>
            <div className="">
              <button onClick={handleLoad}>{loading ? 'Loading...' : 'Load'}</button>
            </div>
          </div>
          <div className="flex flex-row items-center justify-start">
            <div className="">Title</div>
            <div className="">
              <input
                type="text"
                className="block py-1 mx-4 my-2 bg-white border-gray-200 rounded dark:bg-gray-700 dark:border-gray-700"
                placeholder="Feed Title"
                value={feedTitle}
                onChange={(e) => setFeedTitle(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="">{description}</div>
          <div className="flex flex-row">
            <button className="m-1" onClick={handleCancel}>Cancel</button>
            <button className="m-1" onClick={handleSave}>{confirming ? 'Saving..' : 'OK'}</button>
          </div>
        </div>
      )}
      <div className="flex flex-col items-center justify-start border-t-2 border-gray-500 mt-2">
        {realList.map((channel: ChannelType, idx: number) => {
          return (
            <div key={idx} className="flex items-center justify-between">
              <span>{channel.title}</span>
              <button className="cursor-pointer" onClick={() => handleDelete(channel)}>
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