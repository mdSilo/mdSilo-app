import React, { useEffect, useState } from "react";
import { ChannelType } from "./data/dataType";
import { IconTrash } from "@tabler/icons";

type Props = {
  channelList: ChannelType[];
  handleAddFeed?: () => void;
  handleDelete?: (channel: ChannelType) => void;
  handleImport?: () => void;
  handleExport?: () => void;
};

export const FeedManager = (props: Props) => {
  const { channelList, handleDelete } = props;
  const [searchText, setSearchText] = useState<string>("");

  const handleSearch = (v: string) => {
    setSearchText(v);

    if (v) {
      const result = channelList.filter((item) => {
        return item.title.indexOf(v) > -1 || item.link.indexOf(v) > -1
      })
      // setRealList(result);
    } else {
      // setRealList(channelList);
    }
  };

  return (
    <div>
      <div>
        add feed 
        import/export OPML
        search Feed
        feed list: editable, del 
      </div>
    </div>
  );
};
