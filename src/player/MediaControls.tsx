import type { ReactNode } from 'react';
import {
  TbPlayerPause, TbPlayerPlay, TbPlayerSkipBack, TbPlayerSkipForward, TbPlayerStop, TbX,
} from 'react-icons/tb';

export const RATES = [0.75, 1, 1.25, 1.5, 2];

/** 75 → 1:15, 3725 → 1:02:05 */
export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export type Progress = {
  value: number;
  max: number;
  /** e.g. 1:15 / 30:00, 42% */
  label: string;
  onSeek: (value: number) => void;
  title: string;
};

type Props = {
  title?: ReactNode;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  prevTitle?: string;
  nextTitle?: string;
  onStop?: () => void;
  progress?: Progress;
  rate: number;
  onRate: (rate: number) => void;
  /** more controls of the source, after the rate */
  children?: ReactNode;
  onClose?: () => void;
  testId?: string;
};

const button = 'btn btn-ghost btn-xs btn-circle';

/** The controls of a source of the player, the same for each. */
export default function MediaControls(props: Props) {
  const {
    title, playing, onPlay, onPause, onPrev, onNext, prevTitle = 'Previous', nextTitle = 'Next',
    onStop, progress, rate, onRate, children, onClose, testId,
  } = props;
  return (
    <div className="flex flex-col w-full gap-0.5" data-testid={testId}>
      <div className="flex items-center gap-1 min-w-0">
        <div className="flex-1 min-w-0 text-xs truncate">{title}</div>
        {children}
        {onClose ? (
          <button className={button} title="Close" onClick={onClose}><TbX /></button>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {onPrev ? <button className={button} title={prevTitle} onClick={onPrev}><TbPlayerSkipBack /></button> : null}
        {playing ? (
          <button className={`${button} btn-primary btn-soft`} title="Pause" onClick={onPause}><TbPlayerPause /></button>
        ) : (
          <button className={`${button} btn-primary btn-soft`} title="Play" onClick={onPlay}><TbPlayerPlay /></button>
        )}
        {onNext ? <button className={button} title={nextTitle} onClick={onNext}><TbPlayerSkipForward /></button> : null}
        {onStop ? <button className={button} title="Stop" onClick={onStop}><TbPlayerStop /></button> : null}
        {progress ? (
          <>
            <input
              type="range"
              className="flex-1 min-w-16 range range-primary range-xs"
              min={0}
              max={progress.max || 1}
              step="any"
              value={Math.min(progress.value, progress.max || 1)}
              aria-label={progress.title}
              title={progress.title}
              onChange={(e) => progress.onSeek(Number(e.target.value))}
            />
            <span className="text-xs tabular-nums whitespace-nowrap text-base-content/70">{progress.label}</span>
          </>
        ) : <div className="flex-1" />}
        <select
          className="w-16 select select-xs"
          value={rate}
          aria-label="Speed"
          onChange={(e) => onRate(Number(e.target.value))}
        >
          {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
        </select>
      </div>
    </div>
  );
}
