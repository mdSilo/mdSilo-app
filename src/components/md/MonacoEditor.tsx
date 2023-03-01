// TODO: try to mig to monaco-editor
import { useEffect, useState } from 'react';
import MonacoEditor from '@monaco-editor/react';

type Props = {
  lang?: string;
  dark: boolean;
  initialContent?: string;
  onChange?: (content?: string) => void;
  onFocus?: () => void;
  className?: string;
}

export default function Editor(props: Props) {
  const {lang, dark, initialContent = '', onChange, onFocus} = props;
  const [content, setContent] = useState('');
  useEffect(() => {
    setContent(initialContent);
    onChange && onChange(initialContent);
  }, [initialContent, onChange]);

  const handleChange = (val = '') => {
    onChange && onChange(val);
    setContent(val);
  };

  return (
    <div className="h-full" onFocus={onFocus}>
      <MonacoEditor
        theme={dark ? "vs-dark" : "vs"}
        defaultLanguage={lang}
        value={content}
        onChange={handleChange} 
        options={{
          automaticLayout: true,
          fontSize: 14,
          wordWrap: "on",
        }}
      />
    </div>
  );
}
