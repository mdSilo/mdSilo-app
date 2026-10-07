import {
  cloneElement,
  isValidElement,
  ReactElement,
  ReactNode,
  Ref,
  RefCallback,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import tippy, { Instance, Props as TippyOptions } from 'tippy.js';

type TooltipProps = Partial<Omit<TippyOptions, 'content'>> & {
  content: ReactNode;
  children: ReactElement;
  disabled?: boolean;
};

// React 19: `ref` is a regular prop, `element.ref` is removed
const getElementRef = (element: ReactNode) =>
  isValidElement(element)
    ? ((element.props as { ref?: Ref<Element> }).ref ?? undefined)
    : undefined;

const setRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    (ref as { current: T | null }).current = value;
  }
};

/**
 * Tooltip on its only child, which must take a ref to a DOM element.
 * Built on tippy.js directly: `@tippyjs/react` reads `element.ref`, which is
 * removed in React 19 (an error logged, and the child's own ref lost).
 */
export default function Tooltip(props: TooltipProps) {
  const {
    children,
    content,
    disabled = false,
    duration = 0,
    arrow = false,
    offset = [0, 6],
    touch = ['hold', 500],
    ...otherOptions
  } = props;

  const [target, setTarget] = useState<Element | null>(null);
  const [container] = useState(() => document.createElement('div'));
  const instance = useRef<Instance | null>(null);
  const options = { duration, arrow, offset, touch, ...otherOptions };

  useEffect(() => {
    if (!target) return;
    const tip = tippy(target, { ...options, content: container });
    instance.current = tip;
    return () => {
      tip.destroy();
      instance.current = null;
    };
    // created once per target, options are updated below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, container]);

  useEffect(() => {
    instance.current?.setProps(options);
  });

  useEffect(() => {
    const tip = instance.current;
    if (!tip) return;
    if (disabled) {
      tip.hide();
      tip.disable();
    } else {
      tip.enable();
    }
  }, [disabled, target]);

  const childRef = getElementRef(children);
  const ref: RefCallback<Element> = useCallback(
    (node: Element | null) => {
      setTarget(node instanceof Element ? node : null);
      setRef(childRef, node);
    },
    [childRef]
  );

  return (
    <>
      {cloneElement(children as ReactElement<{ ref?: Ref<Element> }>, { ref })}
      {createPortal(content, container)}
    </>
  );
}
