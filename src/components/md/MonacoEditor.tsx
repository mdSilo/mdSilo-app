// TODO: try to mig to monaco-editor
import { useEffect, useState } from 'react';
import MonacoEditor from '@monaco-editor/react';

type Props = {
  lang?: string;
  dark: boolean;
  initialContent?: string;
  onChange?: (content?: string) => void;
  className?: string;
}

export default function Editor(props: Props) {
  const {lang, dark, initialContent = '', onChange} = props;
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
    <div className="h-full">
      <MonacoEditor
        theme={dark ? "vs-dark" : "vs"}
        defaultLanguage={lang}
        value={content}
        onChange={handleChange} 
      />
    </div>
  );
}
