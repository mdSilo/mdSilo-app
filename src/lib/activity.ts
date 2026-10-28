import { getStrDate } from '@/lib/helper';
import type { Note } from '@/types/model';

export type ActivityData = {
  activityNum: number;
  createNum: number;
  updateNum: number;
};

/** activities by day, yyyy-m-d */
export type ActivityRecord = Record<string, ActivityData>;

/** Notes created and updated per day, in one pass. */
export function countNoteActivities(notes: readonly Note[]): ActivityRecord {
  const record: ActivityRecord = {};
  const dayOf = (day: string) => (record[day] ??= { activityNum: 0, createNum: 0, updateNum: 0 });
  for (const note of notes) {
    const created = dayOf(getStrDate(note.created_at));
    created.createNum += 1;
    created.activityNum += 1;
    const updated = dayOf(getStrDate(note.updated_at));
    updated.updateNum += 1;
    updated.activityNum += 1;
  }
  return record;
}

/**
 * The stored activities, raised by the counted ones: the count of a day may
 * drop (a note updated again later), the stored record keeps the most seen.
 * Returns `stored` itself when nothing is raised.
 */
export function mergeActivities(stored: ActivityRecord, counted: ActivityRecord): ActivityRecord {
  let merged: ActivityRecord | undefined;
  for (const [day, count] of Object.entries(counted)) {
    const old = stored[day];
    if (
      old &&
      old.activityNum >= count.activityNum &&
      old.createNum >= count.createNum &&
      old.updateNum >= count.updateNum
    ) {
      continue;
    }
    merged ??= { ...stored };
    merged[day] = {
      activityNum: Math.max(count.activityNum, old?.activityNum ?? 0),
      createNum: Math.max(count.createNum, old?.createNum ?? 0),
      updateNum: Math.max(count.updateNum, old?.updateNum ?? 0),
    };
  }
  return merged ?? stored;
}
