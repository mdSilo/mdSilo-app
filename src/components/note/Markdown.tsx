import { memo, useEffect, useRef } from 'react';
import { useStore } from 'lib/store';

type Props = {
  initialContent: string;
  onChange: (value: string) => void;
  className?: string;
};

function Markdown(props: Props) {
  const { 
    initialContent, 
    onChange, 
    className = '',
  } = props;
  const mdRef = useRef<HTMLPreElement | null>(null);

  const isCheckSpellOn = useStore((state) => state.isCheckSpellOn);
  const readMode = useStore((state) => state.readMode);

  const emitChange = () => {
    if (!mdRef.current) {
      return;
    }
    const content = mdRef.current.textContent ?? '';
    onChange(content);
  };

  // Set the initial title
  useEffect(() => {
    if (!mdRef.current) {
      return;
    }
    mdRef.current.textContent = initialContent;
  }, [initialContent]);

  return (
    <pre
      ref={mdRef}
      className={`border-none focus:outline-none p-0 whitespace-pre-wrap ${className}`}
      role="textbox"
      placeholder="Start Writing..."
      onPaste={(event) => {
        // Remove styling and newlines from the text
        event.preventDefault();
        let text = event.clipboardData.getData('text/plain');
        text = text.replace(/\r?\n|\r/g, ' ');
        document.execCommand('insertText', false, text);
      }}
      onInput={emitChange}
      contentEditable={!readMode}
      spellCheck={isCheckSpellOn}
    />
  );
}

export default memo(Markdown);
