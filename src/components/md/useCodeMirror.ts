import { useEffect, useRef, useState } from 'react';
import { basicSetup } from 'codemirror';
import { Annotation, EditorState, Extension, StateEffect } from '@codemirror/state';
import { indentWithTab } from '@codemirror/commands';
import { EditorView, keymap, ViewUpdate, placeholder } from '@codemirror/view';
import { oneDark } from './darkTheme';
import { ReactCodeMirrorProps } from './ReactCodeMirror';

// stable default: a new array would reconfigure the editor on every render
export const NO_EXTENSIONS: Extension[] = [];

// marks the transactions syncing the `value` prop, not reported by onChange
const External = Annotation.define<boolean>();

export interface UseCodeMirror extends ReactCodeMirrorProps {
  container?: HTMLDivElement | null;
}

export function useCodeMirror(props: UseCodeMirror) {
  const {
    value,
    selection,
    onChange,
    onUpdate,
    extensions = NO_EXTENSIONS,
    autoFocus,
    theme = 'light',
    height = '',
    minHeight = '',
    maxHeight = '',
    placeholder: placeholderStr = '',
    width = '',
    minWidth = '',
    maxWidth = '',
    editable = true,
    readOnly = false,
    indentWithTab: defaultIndentWithTab = true,
    basicSetup: defaultBasicSetup = true,
    root,
  } = props;
  const [container, setContainer] = useState(props.container);
  const [view, setView] = useState<EditorView>();
  const [state, setState] = useState<EditorState>();
  // latest callbacks, the listeners below are created once per view
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const defaultLightThemeOption = EditorView.theme(
    {
      '&': {
        backgroundColor: '#fff',
      },
    },
    {
      dark: false,
    },
  );
  const defaultThemeOption = EditorView.theme({
    '&': {
      height,
      minHeight,
      maxHeight,
      width,
      minWidth,
      maxWidth,
    },
  });

  const updateListener = EditorView.updateListener.of((vu: ViewUpdate) => {
    const onChangeFn = onChangeRef.current;
    if (
      vu.docChanged &&
      typeof onChangeFn === 'function' &&
      !vu.transactions.some((tr) => tr.annotation(External))
    ) {
      const doc = vu.state.doc;
      const value = doc.toString();
      onChangeFn(value, vu);
    }
  });

  let getExtensions = [updateListener, defaultThemeOption];
  if (defaultIndentWithTab) {
    getExtensions.unshift(keymap.of([indentWithTab]));
  }
  if (defaultBasicSetup) {
    getExtensions.unshift(basicSetup);
  }
  if (placeholderStr) {
    getExtensions.unshift(placeholder(placeholderStr));
  }
  switch (theme) {
    case 'light':
      getExtensions.push(defaultLightThemeOption);
      break;
    case 'dark':
      getExtensions.push(oneDark);
      break;
    default:
      getExtensions.push(theme);
      break;
  }
  if (editable === false) {
    getExtensions.push(EditorView.editable.of(false));
  }
  if (readOnly) {
    getExtensions.push(EditorState.readOnly.of(true));
  }
  if (onUpdate && typeof onUpdate === 'function') {
    getExtensions.push(EditorView.updateListener.of((vu) => onUpdateRef.current?.(vu)));
  }
  getExtensions.push(EditorView.lineWrapping)
  getExtensions = getExtensions.concat(extensions);

  // create the view once the container is set, destroy it on cleanup:
  // effects run twice in StrictMode, a view must never be left behind
  useEffect(() => {
    if (!container) return;
    const stateCurrent = EditorState.create({
      doc: value,
      selection,
      extensions: getExtensions,
    });
    const viewCurrent = new EditorView({
      state: stateCurrent,
      parent: container,
      root,
    });
    setState(stateCurrent);
    setView(viewCurrent);
    return () => {
      viewCurrent.destroy();
      setView(undefined);
      setState(undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  useEffect(() => {
    if (autoFocus && view) {
      view.focus();
    }
  }, [autoFocus, view]);

  useEffect(() => {
    const currentValue = view ? view.state.doc.toString() : '';
    if (view && value !== currentValue) {
      view.dispatch({
        changes: { from: 0, to: currentValue.length, insert: value || '' },
        annotations: [External.of(true)],
      });
    }
  }, [value, view]);

  useEffect(() => {
    if (view) {
      view.dispatch({ effects: StateEffect.reconfigure.of(getExtensions) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    theme,
    extensions,
    height,
    minHeight,
    maxHeight,
    width,
    placeholderStr,
    minWidth,
    maxWidth,
    editable,
    defaultIndentWithTab,
    defaultBasicSetup,
  ]);

  return { state, setState, view, setView, container, setContainer };
}
