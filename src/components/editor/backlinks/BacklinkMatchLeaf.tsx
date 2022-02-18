import { memo, useMemo } from 'react';
import { BacklinkMatch } from 'editor/backlinks/useBacklinks';
import useOnNoteLinkClick from 'editor/hooks/useOnNoteLinkClick';
import { useCurrentContext } from 'editor/hooks/useCurrent';
import ReadOnlyEditor from '../ReadOnlyEditor';

type BacklinkMatchLeafProps = {
  noteId: string;
  match: BacklinkMatch;
  className?: string;
};

const BacklinkMatchLeaf = (props: BacklinkMatchLeafProps) => {
  const { noteId, match, className } = props;
  const currentNote = useCurrentContext();
  const { onClick: onNoteLinkClick, defaultStackingBehavior } =
    useOnNoteLinkClick(currentNote.id);

  const editorValue = useMemo(() => [match.lineElement], [match.lineElement]);
  const containerClassName = `block text-left text-xs rounded p-2 my-1 w-full break-words ${className}`;

  return (
    <button
      className={containerClassName}
      onClick={(e) =>
        onNoteLinkClick(noteId, defaultStackingBehavior(e), match.linePath)
      }
    >
      <ReadOnlyEditor value={editorValue} />
    </button>
  );
};

export default memo(BacklinkMatchLeaf);
