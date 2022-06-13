/* eslint-disable react/prop-types */
import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { EditorState, EditorStateConfig, Extension } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { useCodeMirror } from './useCodeMirror';

export interface ReactCodeMirrorProps
  extends Omit<EditorStateConfig, 'doc' | 'extensions'>,
    Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'placeholder'> {
  value?: string;
  height?: string;
  minHeight?: string;
  maxHeight?: string;
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  autoFocus?: boolean;
  placeholder?: string | HTMLElement;
  /**
   * `light` / `dark` / `Extension` Defaults to `light`.
   * @default light
   */
  theme?: 'light' | 'dark' | Extension;
  /**
   * Whether to optional basicSetup by default
   * @default true
   */
  basicSetup?: boolean;
  /**
   * This disables editing of the editor content by the user.
   * @default true
   */
  editable?: boolean;
  readOnly?: boolean;
  /**
   * Whether to optional basicSetup by default
   * @default true
   */
  indentWithTab?: boolean;
  onChange?(value: string, viewUpdate: ViewUpdate): void;
  onUpdate?(viewUpdate: ViewUpdate): void;
  // https://codemirror.net/docs/ref/#state.Extension
  extensions?: Extension[];
  root?: ShadowRoot | Document;
}

export interface ReactCodeMirrorRef {
  editor?: HTMLDivElement | null;
  state?: EditorState;
  view?: EditorView;
}

const ReactCodeMirror = forwardRef<ReactCodeMirrorRef, ReactCodeMirrorProps>((props, ref) => {
  const {
    className,
    value = '',
    selection,
    extensions = [],
    onChange,
    onUpdate,
    autoFocus,
    theme = 'light',
    height,
    minHeight,
    maxHeight,
    width,
    minWidth,
    maxWidth,
    basicSetup,
    placeholder,
    indentWithTab,
    editable,
    readOnly,
    root,
    ...other
  } = props;
  const editor = useRef<HTMLDivElement>(null);
  const { state, view, container, setContainer } = useCodeMirror({
    container: editor.current,
    root,
    value,
    autoFocus,
    theme,
    height,
    minHeight,
    maxHeight,
    width,
    minWidth,
    maxWidth,
    basicSetup,
    placeholder,
    indentWithTab,
    editable,
    readOnly,
    selection,
    onChange,
    onUpdate,
    extensions,
  });
  useImperativeHandle(ref, () => ({ editor: container, state, view }), [container, state, view]);
  useEffect(() => {
    setContainer(editor.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof value !== 'string') {
    throw new Error(`value must be typeof string but got ${typeof value}`);
  }

  const defaultClassNames = typeof theme === 'string' ? `cm-theme-${theme}` : 'cm-theme';
  return (
    <div 
      ref={editor} 
      className={`${defaultClassNames}${className ? ` ${className}` : ''}`} 
      {...other}
    >
    </div>
  );
});

ReactCodeMirror.displayName = 'CodeMirror';

export default ReactCodeMirror;
