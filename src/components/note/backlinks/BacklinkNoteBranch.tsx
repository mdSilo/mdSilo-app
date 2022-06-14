import { memo } from 'react';
import useOnNoteLinkClick from 'editor/hooks/useOnNoteLinkClick';
import { Backlink } from './useBacklinks';

type BacklinkNoteBranchProps = {
  backlink: Backlink;
};

const BacklinkNoteBranch = (props: BacklinkNoteBranchProps) => {
  const { backlink } = props;
  const { onClick: onNoteLinkClick } = useOnNoteLinkClick();

  return (
    <button
      className="py-1 link"
      onClick={(e) => {
        e.stopPropagation();
        onNoteLinkClick(backlink.id);
      }}
    >
      {backlink.title}
    </button>
  );
};

export default memo(BacklinkNoteBranch);
