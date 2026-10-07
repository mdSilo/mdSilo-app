import { useMemo } from 'react';
import { useCurrentViewContext } from 'context/useCurrentView';
import Tree from 'components/misc/Tree';
import useBacklinks from './useBacklinks';
import type { Backlink, BacklinkMatch } from './useBacklinks';
import BacklinkBranch from './BacklinkBranch';
import BacklinkMatchLeaf from './BacklinkMatchLeaf';
import BacklinkNoteBranch from './BacklinkNoteBranch';

const MAX_EXPANDED_MATCHES = 42;

type Props = {
  className?: string;
  isCollapse?: boolean;
};

export default function Backlinks(props: Props) {
  const { className, isCollapse = false } = props;
  const currentView = useCurrentViewContext();
  const params = currentView.state.params;
  const noteId = params?.noteId || '';
  const { linkedBacklinks, unlinkedBacklinks } = useBacklinks(noteId);

  const backlinkData = useMemo(
    () => getTreeData(linkedBacklinks, unlinkedBacklinks),
    [linkedBacklinks, unlinkedBacklinks]
  );

  const collapseAll = useMemo(() => {
    const numOfLinkedMatches = getNumOfMatches(linkedBacklinks);
    const numOfUnlinkedMatches = getNumOfMatches(unlinkedBacklinks);
    return (
      isCollapse || 
      numOfLinkedMatches > MAX_EXPANDED_MATCHES ||
      numOfUnlinkedMatches > MAX_EXPANDED_MATCHES
    );
  }, [linkedBacklinks, unlinkedBacklinks, isCollapse]);

  return (
    // keyed by note: reset the collapsed state on switching note
    <Tree key={noteId} data={backlinkData} className={className} collapseAll={collapseAll} />
  );
}

export const getNumOfMatches = (backlinks: Backlink[]) =>
  backlinks.reduce(
    (numOfMatches, backlink) => numOfMatches + backlink.matches.length,
    0
  );

const getTreeData = (
  linkedBacklinks: Backlink[],
  unlinkedBacklinks: Backlink[]
) => {
  const numOfLinkedMatches = getNumOfMatches(linkedBacklinks);
  const numOfUnlinkedMatches = getNumOfMatches(unlinkedBacklinks);

  return [
    {
      id: 'linked-backlinks',
      labelNode: (<BacklinkBranch title={`${numOfLinkedMatches} BackLinks`}/>),
      children: linkedBacklinks.map(backlinkToTreeData(true)),
    },
    {
      id: 'unlinked-backlinks',
      labelNode: (<BacklinkBranch title={`${numOfUnlinkedMatches} Mentions`}/>),
      children: unlinkedBacklinks.map(backlinkToTreeData(false)),
    },
  ];
};

// eslint-disable-next-line react/display-name
const backlinkToTreeData = (isLinked: boolean) => (backlink: Backlink) => {
  // one leaf per block, highlighting all the matches in the block
  const blocks = new Map<number, BacklinkMatch[]>();
  for (const match of backlink.matches) {
    const matches = blocks.get(match.block);
    if (matches) {
      matches.push(match);
    } else {
      blocks.set(match.block, [match]);
    }
  }

  const idPrefix = isLinked ? 'linked' : 'unlinked';

  return {
    id: `${idPrefix}-${backlink.id}`,
    labelNode: <BacklinkNoteBranch backlink={backlink} />,
    children: [...blocks].map(([block, matches]) => ({
      id: `${idPrefix}-${backlink.id}-${block}`,
      labelNode: (
        <BacklinkMatchLeaf
          noteId={backlink.id}
          matches={matches}
          className="text-gray-600 dark:text-gray-100 bg-white dark:bg-black"
        />
      ),
      showArrow: false,
    })),
  };
};
