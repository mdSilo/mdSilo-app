import { ReactNode, useState } from 'react';
//import { Transforms } from 'slate';
import {
  //ReactEditor,
  RenderElementProps,
  useReadOnly,
  //useSlateStatic,
} from 'slate-react';
import { CodeBlock } from 'editor/slate';


type Props = {
  element: CodeBlock;
  children: ReactNode;
  attributes: RenderElementProps['attributes'];
  className?: string;
};

export const CodeBlockElement = (props: Props) => {
  const { attributes, children, element, className } = props;
  //const editor = useSlateStatic();

  const { lang } = element;
  
  const codeClassName = (lang ? `lang-${lang} lang` : '') + ` block p-2 bg-gray-100 border border-gray-200 rounded dark:bg-gray-800 dark:border-gray-700 ${className}`;

  return (
    <>
      {/* <div>
          <CodeBlockSelect
            data-testid="CodeBlockSelect"
            lang={lang}
            onChange={(val: string) => {
              const path = ReactEditor.findPath(editor, element);
              Transforms.setNodes(
                editor,
                { lang: val },
                { at: path }
              );
            }}
          />
      </div> */}
      <code
        className={codeClassName} 
        spellCheck="false"
        {...attributes}
      >
        {children}
      </code>
    </>
  );
};


type SelectProps = {
  lang?: string;
  onChangeVal: (val: string) => void;
  className?: string;
};

// try TODO: code highlight
export const CodeBlockSelect = (props: SelectProps) => {
  const {lang, onChangeVal} = props;
  const [value, setValue] = useState(lang);

  if (useReadOnly()) return null;

  return (
    <select
      value={value}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onChange={(e) => {
        onChangeVal(e.target.value);
        setValue(e.target.value);
      }}
      contentEditable={false}
      {...props}
    >
      <option value="">Plain text</option>
      {Object.entries(CODE_BLOCK_LANGUAGES).map(([key, val]) => (
        <option key={key} value={key}>
          {val}
        </option>
      ))}
    </select>
  );
};

const CODE_BLOCK_LANGUAGES: Record<string, string> = {
  antlr4: 'ANTLR4',
  bash: 'Bash',
  c: 'C',
  csharp: 'C#',
  css: 'CSS',
  coffeescript: 'CoffeeScript',
  cmake: 'CMake',
  dart: 'Dart',
  docker: 'Docker',
  ejs: 'EJS',
  erlang: 'Erlang',
  git: 'Git',
  go: 'Go',
  graphql: 'GraphQL',
  groovy: 'Groovy',
  html: 'HTML',
  java: 'Java',
  javascript: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  kotlin: 'Kotlin',
  latex: 'LaTeX',
  less: 'Less',
  lua: 'Lua',
  makefile: 'Makefile',
  markdown: 'Markdown',
  matlab: 'MATLAB',
  markup: 'Markup',
  objectivec: 'Objective-C',
  perl: 'Perl',
  php: 'PHP',
  powershell: 'PowerShell',
  properties: '.properties',
  protobuf: 'Protocol Buffers',
  python: 'Python',
  r: 'R',
  ruby: 'Ruby',
  rust: 'Rust',
  scala: 'Scala',
  scheme: 'Scheme',
  sql: 'SQL',
  shell: 'Shell',
  swift: 'Swift',
  svg: 'SVG',
  tsx: 'TSX',
  typescript: 'TypeScript',
  wasm: 'WebAssembly',
  yaml: 'YAML',
  xml: 'XML',
};
