import { MenuSeparator } from '@headlessui/react';
import { TbCheck, TbLayoutGrid, TbList, TbSortAscending, TbSortDescending } from 'react-icons/tb';
import Dropdown, { DropdownItem } from '@/ui/Dropdown';
import { useStore } from '@/state/store';
import { 
  withLibraryDefaults, type GroupBy, type LibrarySettings, type SortBy, type ViewMode 
} from './shelf';

const VIEWS: [ViewMode, string][] = [['grid', 'Grid'], ['list', 'List']];
const GROUP_BYS: [GroupBy, string][] = [
  ['none', 'Books'], ['group', 'Groups'], ['author', 'Authors'], ['series', 'Series'], ['status', 'Status'],
];
const SORT_BYS: [SortBy, string][] = [
  ['title', 'Title'], ['author', 'Author'], ['format', 'Format'], ['series', 'Series'],
  ['read', 'Date read'], ['added', 'Date added'], ['published', 'Date published'],
];
const ORDERS: [boolean, string][] = [[true, 'Ascending'], [false, 'Descending']];

/** The settings of the library, as stored. */
export function useLibrarySettings() {
  const settings = withLibraryDefaults(useStore((state) => state.librarySettings));
  const setSettings = useStore((state) => state.setLibrarySettings);
  const update = (patch: Partial<LibrarySettings>) => setSettings((s) => ({ ...withLibraryDefaults(s), ...patch }));
  return [settings, update] as const;
}

/** How the library shows: as a grid or list, grouped by, sorted by. */
export default function ViewMenu({ onGroupBy }: { onGroupBy: (groupBy: GroupBy) => void }) {
  const [settings, update] = useLibrarySettings();
  const section = <T,>(title: string, options: [T, string][], current: T, choose: (value: T) => void) => (
    <>
      <div className="px-4 pt-2 pb-1 text-xs text-base-content/50">{title}</div>
      {options.map(([value, label]) => (
        <DropdownItem key={String(value)} onClick={() => choose(value)}>
          <span className="flex-1">{label}</span>
          {value === current ? <TbCheck size={14} aria-label="chosen" /> : null}
        </DropdownItem>
      ))}
    </>
  );
  return (
    <Dropdown
      buttonClassName="btn btn-sm btn-ghost"
      buttonChildren={
        <span className="flex items-center gap-1">
          {settings.view === 'grid' ? <TbLayoutGrid size={18} /> : <TbList size={18} />}
          {settings.ascending ? <TbSortAscending size={18} /> : <TbSortDescending size={18} />}
        </span>
      }
      tooltipContent="View, group by, sort by"
      placement="bottom-end"
      itemsClassName="py-1"
    >
      <div aria-label="View menu">
        {section('View', VIEWS, settings.view, (view) => update({ view }))}
        <MenuSeparator className="my-1 border-t border-base-300" />
        {section('Group by', GROUP_BYS, settings.groupBy, onGroupBy)}
        <MenuSeparator className="my-1 border-t border-base-300" />
        {section('Sort by', SORT_BYS, settings.sortBy, (sortBy) => update({ sortBy }))}
        <MenuSeparator className="my-1 border-t border-base-300" />
        {section('Order', ORDERS, settings.ascending, (ascending) => update({ ascending }))}
      </div>
    </Dropdown>
  );
}
