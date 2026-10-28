import { invoke } from '@tauri-apps/api/core';
import { joinPath } from '@/workspace/util';
import { DATA_DIR } from '@/workspace/layout';
import { BOOK_STATE_DIR, type BookState } from './library';

/** Seconds read per day (`yyyy-m-d`), of all the books of the workspace. */
export async function readingTimeByDay(ws: string): Promise<Record<string, number>> {
  const dir = joinPath(ws, DATA_DIR, BOOK_STATE_DIR);
  const entries = await invoke<{ file_path: string; file_name: string }[]>('list_directory', { dir })
    .catch(() => []);
  const total: Record<string, number> = {};
  for (const entry of entries ?? []) {
    if (!entry.file_name.endsWith('.json')) continue;
    try {
      const state = JSON.parse(await invoke<string>('read_file', { filePath: entry.file_path })) as BookState;
      for (const [day, seconds] of Object.entries(state.time ?? {})) {
        if (typeof seconds === 'number' && seconds > 0) total[day] = (total[day] ?? 0) + seconds;
      }
    } catch {
      // a broken file: not counted
    }
  }
  return total;
}

/** The time read of a book, all days. */
export const totalSeconds = (time?: Record<string, number>) =>
  Object.values(time ?? {}).reduce((sum, s) => sum + (s > 0 ? s : 0), 0);

/** `1h 20m`, `5m`, `<1m` */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}
