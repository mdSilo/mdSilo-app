import { TbX as IconX } from 'react-icons/tb';
import type { Label } from './types';

/** Black or white, whichever reads better on the given hex color. */
export function textColorFor(bg: string) {
  const hex = bg.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const n = parseInt(full, 16);
  if (Number.isNaN(n) || full.length !== 6) return '#000';
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // perceived luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#000' : '#fff';
}

type Props = {
  label: Label;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
};

export default function LabelChip({ label, onRemove, onClick, className = '' }: Props) {
  const style = { backgroundColor: label.color, color: textColorFor(label.color) };
  const cls = `inline-flex items-center px-2 text-xs font-medium leading-5 rounded-full whitespace-nowrap ${className}`;
  const content = (
    <>
      {label.name}
      {onRemove ? (
        <span
          role="button"
          aria-label={`Remove label ${label.name}`}
          className="ml-1 opacity-70 hover:opacity-100 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <IconX size={12} />
        </span>
      ) : null}
    </>
  );
  return onClick ? (
    <button type="button" className={cls} style={style} title={label.description} onClick={onClick}>
      {content}
    </button>
  ) : (
    <span className={cls} style={style} title={label.description}>{content}</span>
  );
}

export const LABEL_COLORS = [
  '#d73a4a', '#f59e0b', '#fbca04', '#0e8a16', '#a2eeef',
  '#0ea5e9', '#4f46e5', '#7c3aed', '#d876e3', '#6b7280',
];

type ColorProps = {
  value: string;
  onChange: (color: string) => void;
};

/** Palette plus a free color input, like the kanban SetColor. */
export function ColorPicker({ value, onChange }: ColorProps) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {LABEL_COLORS.map((c) => (
        <button
          type="button"
          key={c}
          aria-label={`color ${c}`}
          className={`w-5 h-5 rounded-full border-2 ${c === value ? 'border-gray-800 dark:border-white' : 'border-transparent'}`}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
        />
      ))}
      <input
        type="color"
        aria-label="custom color"
        className="w-8 h-6 p-0 border-none bg-transparent"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
