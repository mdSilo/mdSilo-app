import { memo } from 'react';
import MsEditor from "mdsmirror";
import useOnNoteLinkClick from 'editor/hooks/useOnNoteLinkClick';
import { useStore } from 'lib/store';
import { shortenString } from 'utils/helper';
import { BacklinkMatch } from './useBacklinks';

type BacklinkMatchLeafProps = {
  noteId: string;
  match: BacklinkMatch;
  className?: string;
};

const BacklinkMatchLeaf = (props: BacklinkMatchLeafProps) => {
  const { noteId, match, className } = props;
  const { onClick: onNoteLinkClick } = useOnNoteLinkClick();
  const darkMode = useStore((state) => state.darkMode);
  const isRTL = useStore((state) => state.isRTL);

  const leafValue: string = match.context 
    ? getContextString(match.context) || match.text  
    : match.text;
  const editorValue = shortenString(leafValue, match.text);

  const containerClassName = `block text-left text-xs rounded p-2 my-1 w-full break-words ${className}`;

  return (
    <button
      className={containerClassName}
      onClick={() => onNoteLinkClick(noteId)}
    >
      <MsEditor value={editorValue} dark={darkMode} dir={isRTL ? 'rtl' : 'ltr'} />
    </button>
  );
};

export default memo(BacklinkMatchLeaf);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getContextString = (nodes: any[]) => 
  nodes.reduce((res, node) => res + ' ' + (node.text || ''), '');
