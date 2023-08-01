import { IconFolder, IconHash, IconPlaylist, IconSearch } from '@tabler/icons-react';
import Tooltip from 'components/misc/Tooltip';
import { SidebarTab as SidebarTabType, useStore } from 'lib/store';
import SidebarNotes from './SidebarNotes';
import SidebarPlaylist from './SidebarPlaylist';
import SidebarSearch from './SidebarSearch';
import SidebarTab from './SidebarTab';
import SidebarTags from './SidebarTags';

type Props = {
  className?: string;
};

export default function SidebarContent(props: Props) {
  const { className } = props;
  const activeTab = useStore((state) => state.sidebarTab);
  const setActiveTab = useStore((state) => state.setSidebarTab);

  return (
    <div className={`flex flex-col ${className}`}>
      <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="flex flex-col flex-1 overflow-x-hidden">
        {activeTab === SidebarTabType.Silo ? <SidebarNotes /> : null}
        {activeTab === SidebarTabType.Search ? <SidebarSearch /> : null}
        {activeTab === SidebarTabType.Hashtag ? <SidebarTags /> : null}
        {activeTab === SidebarTabType.Playlist ? <SidebarPlaylist /> : null}
      </div>
    </div>
  );
}

type TabsProps = {
  activeTab: SidebarTabType;
  setActiveTab: (tab: SidebarTabType) => void;
};

const Tabs = (props: TabsProps) => {
  const { activeTab, setActiveTab } = props;

  return (
    <div className="flex">
      <Tooltip content="Silo (Ctrl/⌘+Shift+D)">
        <SidebarTab
          isActive={activeTab === SidebarTabType.Silo}
          setActive={() => setActiveTab(SidebarTabType.Silo)}
          Icon={IconFolder}
        />
      </Tooltip>
      <Tooltip content="Search (Ctrl/⌘+Shift+F)">
        <SidebarTab
          isActive={activeTab === SidebarTabType.Search}
          setActive={() => setActiveTab(SidebarTabType.Search)}
          Icon={IconSearch}
        />
      </Tooltip>
      <Tooltip content="Hashtags (Ctrl/⌘+Shift+H)">
        <SidebarTab
          isActive={activeTab === SidebarTabType.Hashtag}
          setActive={() => setActiveTab(SidebarTabType.Hashtag)}
          Icon={IconHash}
        />
      </Tooltip>
      <Tooltip content="Playlist (Ctrl/⌘+Shift+P)">
        <SidebarTab
          isActive={activeTab === SidebarTabType.Playlist}
          setActive={() => setActiveTab(SidebarTabType.Playlist)}
          Icon={IconPlaylist}
        />
      </Tooltip>
    </div>
  );
};
