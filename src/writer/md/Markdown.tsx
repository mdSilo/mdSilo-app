import { memo, useMemo } from "react";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { languages } from "@codemirror/language-data";
import { EditorView } from "@codemirror/view";
import CodeMirror from "./ReactCodeMirror";

type Props = {
  lang?: string;
  initialContent: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  dark: boolean;
  readMode?: boolean;
  /** the CSS font-family of the text, '' for the default monospace */
  fontFamily?: string;
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
    fontFamily = "",
    className = "",
  } = props;

  //const readMode = useStore((state) => state.readMode);

  // keep the same extensions across renders: new ones reconfigure the editor
  const extensions = useMemo(
    () => [
      lang === "markdown"
        ? markdown({ base: markdownLanguage, codeLanguages: languages })
        : json(),
      ...(fontFamily
        ? [EditorView.theme({ ".cm-scroller": { fontFamily } })]
        : []),
    ],
    [lang, fontFamily],
  );

  const onValueChange = (value: string, _viewUpdate: unknown) => {
    // console.log('md Changed, value:', value, _viewUpdate);
    onChange(value);
  };

  return (
    <CodeMirror
      value={initialContent}
      onChange={onValueChange}
      onFocus={onFocus}
      extensions={extensions}
      className={`border-none focus:outline-hidden p-0 wrap-break-word ${className}`}
      theme={dark ? "dark" : "light"}
      editable={!readMode}
    />
  );
}

export default memo(Markdown);
