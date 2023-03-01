import { memo } from 'react';
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { languages } from "@codemirror/language-data";
import CodeMirror from "./ReactCodeMirror";

type Props = {
  lang?: string;
  initialContent: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  dark: boolean;
  readMode?: boolean;
  className?: string;
};

function Markdown(props: Props) {
  const { 
    lang = "markdown",
    initialContent, 
    onChange, 
    onFocus,
    dark,
    readMode = false,
    className = '',
  } = props;

  //const readMode = useStore((state) => state.readMode); 

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onValueChange = (value: string, _viewUpdate: unknown) => {
    // console.log('md Changed, value:', value, _viewUpdate);
    onChange(value);
  };

  return (
    <CodeMirror
      value={initialContent}
      onChange={onValueChange}
      onFocus={onFocus}
      extensions={lang === "markdown" 
        ? [markdown({ base: markdownLanguage, codeLanguages: languages })]
        : [json()]
      }
      className={`border-none focus:outline-none p-0 break-words ${className}`}
      theme={dark ? 'dark' : 'light'}
      editable={!readMode}
    />
  );
}

export default memo(Markdown);
