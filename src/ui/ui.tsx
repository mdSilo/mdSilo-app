/**
 * Small reusable controls: spinner, tooltip, icon button, and the rows of
 * the settings menus (toggle, select, range, number, segmented buttons).
 * A settings row is a label on the left, the control on the right.
 *
 * Each takes optional `size`, `color` and class names, with defaults that fit
 * the settings menus. The classes are spelled out in full maps below, so
 * Tailwind finds them when it scans the source.
 */
import {
  cloneElement,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefCallback,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import tippy, { type Instance, type Props as TippyOptions } from 'tippy.js';

/* Shared options */

export type Size = 'xs' | 'sm' | 'md' | 'lg';
export type Color =
  'primary' | 'secondary' | 'accent' | 'neutral' | 'info' | 'success' | 'warning' | 'error';

const join = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' ');

/* Spinner */

const SPINNER_SIZES: Record<Size, string> = {
  xs: 'w-4 h-4 border-2', sm: 'w-5 h-5 border-2', md: 'w-8 h-8 border-4', lg: 'w-12 h-12 border-4',
};
const SPINNER_COLORS: Record<Color, string> = {
  primary: 'border-t-primary border-r-primary',
  secondary: 'border-t-secondary border-r-secondary',
  accent: 'border-t-accent border-r-accent',
  neutral: 'border-t-neutral border-r-neutral',
  info: 'border-t-info border-r-info',
  success: 'border-t-success border-r-success',
  warning: 'border-t-warning border-r-warning',
  error: 'border-t-error border-r-error',
};

export function Spinner(
  { size = 'md', color = 'primary', className }: { size?: Size; color?: Color; className?: string }
) {
  return (
    <div
      data-testid="spinner"
      className={join(
        'ease-linear rounded-full animate-spin border-base-300',
        SPINNER_SIZES[size], SPINNER_COLORS[color], className,
      )}
    />
  );
}

/* Tooltip */

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
export function Tooltip(props: TooltipProps) {
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

/* Buttons */

const BTN_SIZES: Record<Size, string> = { xs: 'btn-xs', sm: 'btn-sm', md: 'btn-md', lg: 'btn-lg' };
const BTN_COLORS: Record<Color, string> = {
  primary: 'btn-primary', secondary: 'btn-secondary', accent: 'btn-accent', neutral: 'btn-neutral',
  info: 'btn-info', success: 'btn-success', warning: 'btn-warning', error: 'btn-error',
};
const BTN_VARIANTS = { ghost: 'btn-ghost', soft: 'btn-soft', outline: 'btn-outline', solid: '' } as const;

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  title: string;
  active?: boolean;
  size?: Size;
  color?: Color;
  variant?: keyof typeof BTN_VARIANTS;
};

/** Square button with an icon, its title as the accessible name. Ghost by default. */
export function IconButton(
  { title, active, size = 'sm', color, variant = 'ghost', className, children, ...rest }: IconButtonProps
) {
  return (
    <button
      type="button"
      className={join(
        'btn btn-square', BTN_VARIANTS[variant], BTN_SIZES[size],
        color && BTN_COLORS[color], active && 'btn-active', className,
      )}
      title={title}
      aria-label={title}
      {...rest}
    >
      {children}
    </button>
  );
}

/* Settings rows */

type RowProps = {
  label: ReactNode;
  /** of the row */
  className?: string;
};

function Row(
  { 
    label, 
    className, 
    children, 
    as: Tag = 'label' 
  }: RowProps & { 
    children: ReactNode; 
    as?: 'label' | 'div' 
  }
) {
  return (
    <Tag className={join('flex items-center justify-between gap-2', className)}>
      <span>{label}</span>
      {children}
    </Tag>
  );
}

const TOGGLE_SIZES: Record<Size, string> = {
  xs: 'toggle-xs', sm: 'toggle-sm', md: 'toggle-md', lg: 'toggle-lg',
};
const TOGGLE_COLORS: Record<Color, string> = {
  primary: 'toggle-primary', secondary: 'toggle-secondary', accent: 'toggle-accent',
  neutral: 'toggle-neutral', info: 'toggle-info', success: 'toggle-success',
  warning: 'toggle-warning', error: 'toggle-error',
};

export function Toggle(
  { label, checked, onChange, size = 'sm', color = 'primary', className, ariaLabel }: RowProps & {
    checked: boolean; onChange: (v: boolean) => void; size?: Size; color?: Color; ariaLabel?: string;
  }
) {
  return (
    <Row label={label} className={className}>
      <input
        type="checkbox"
        className={join('toggle', TOGGLE_SIZES[size], TOGGLE_COLORS[color])}
        checked={checked}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        onChange={(e) => onChange(e.target.checked)}
      />
    </Row>
  );
}

const SELECT_SIZES: Record<Size, string> = {
  xs: 'select-xs', sm: 'select-sm', md: 'select-md', lg: 'select-lg',
};
const SELECT_COLORS: Record<Color, string> = {
  primary: 'select-primary', secondary: 'select-secondary', accent: 'select-accent',
  neutral: 'select-neutral', info: 'select-info', success: 'select-success',
  warning: 'select-warning', error: 'select-error',
};

export function Select(
  { label, value, onChange, children, size = 'xs', color, width = 'w-40', className, ariaLabel }: RowProps & {
    value: string; onChange: (v: string) => void; children: ReactNode;
    size?: Size; color?: Color; width?: string; ariaLabel?: string;
  }
) {
  return (
    <Row label={label} className={className}>
      <select
        className={join('select', SELECT_SIZES[size], color && SELECT_COLORS[color], width)}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </Row>
  );
}

const RANGE_SIZES: Record<Size, string> = {
  xs: 'range-xs', sm: 'range-sm', md: 'range-md', lg: 'range-lg',
};
const RANGE_COLORS: Record<Color, string> = {
  primary: 'range-primary', secondary: 'range-secondary', accent: 'range-accent',
  neutral: 'range-neutral', info: 'range-info', success: 'range-success',
  warning: 'range-warning', error: 'range-error',
};

/** A slider, the value shown on its right if `format` is given. */
export function Range(
  { 
    label, 
    value, 
    min, 
    max, 
    step = 1, 
    format, 
    onChange, 
    size = 'xs', 
    color, 
    width = 'w-36', 
    className, 
    ariaLabel 
  }: RowProps & {
    value: number; 
    min: number; 
    max: number; 
    step?: number;
    format?: (v: number) => string; 
    onChange: (v: number) => void;
    size?: Size; 
    color?: Color; 
    width?: string;
    ariaLabel?: string;
  }
) {
  return (
    <Row label={label} className={className}>
      <input
        type="range" min={min} max={max} step={step}
        className={join('range', RANGE_SIZES[size], color && RANGE_COLORS[color], width)}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {format ? <span className="w-8 text-right">{format(value)}</span> : null}
    </Row>
  );
}

const INPUT_SIZES: Record<Size, string> = {
  xs: 'input-xs', sm: 'input-sm', md: 'input-md', lg: 'input-lg',
};

export function NumberInput(
  { label, value, step, digits, unit, onChange, size = 'xs', width = 'w-20', className, ariaLabel }: RowProps & {
    value: number; step: number; digits: number; unit?: string; onChange: (v: number) => void;
    size?: Size; width?: string; ariaLabel?: string;
  }
) {
  return (
    <Row label={label} className={className}>
      <span className="flex items-center gap-1">
        <input
          type="number" step={step}
          className={join('input', INPUT_SIZES[size], width)}
          aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
          value={value.toFixed(digits)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="w-5 text-xs text-base-content/70">{unit}</span>
      </span>
    </Row>
  );
}

/** One of a few options, as joined buttons; the picked one active, or in `color`. */
export function Segmented<T extends string | number>(
  { label, value, options, onChange, size = 'xs', color, className }: RowProps & {
    value: T; options: readonly (readonly [T, ReactNode])[]; onChange: (v: T) => void;
    size?: Size; color?: Color;
  }
) {
  return (
    <Row label={label} className={className} as="div">
      <div className="join" role="group" aria-label={typeof label === 'string' ? label : undefined}>
        {options.map(([option, name]) => (
          <button
            key={option}
            type="button"
            className={join(
              'join-item btn', BTN_SIZES[size],
              value === option && (color ? BTN_COLORS[color] : 'btn-active'),
            )}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {name}
          </button>
        ))}
      </div>
    </Row>
  );
}
