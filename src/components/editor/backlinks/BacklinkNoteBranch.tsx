import { memo } from 'react';
import { Backlink } from 'editor/backlinks/useBacklinks';
import useOnNoteLinkClick from 'editor/hooks/useOnNoteLinkClick';
import { useCurrentMdContext } from 'context/useCurrentMd';

type BacklinkNoteBranchProps = {
  backlink: Backlink;
};

const BacklinkNoteBranch = (props: BacklinkNoteBranchProps) => {
  const { backlink } = props;
  const currentNote = useCurrentMdContext();
  const { onClick: onNoteLinkClick, defaultStackingBehavior } =
    useOnNoteLinkClick(currentNote.id);

  return (
    <button
      className="py-1 link"
      onClick={(e) => {
        e.stopPropagation();
        onNoteLinkClick(backlink.id, defaultStackingBehavior(e));
      }}
    >
      {backlink.title}
    </button>
  );
};

export default memo(BacklinkNoteBranch);
