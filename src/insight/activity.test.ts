import { describe, expect, test } from 'vitest';
import { makeNote } from '../testUtils';
import { countNoteActivities, mergeActivities, type ActivityRecord } from './activity';

describe('countNoteActivities', () => {
  test('counts created and updated notes per day', () => {
    const notes = [
      makeNote({ id: '/a.md', created_at: '2022-01-01T10:00:00', updated_at: '2022-01-02T10:00:00' }),
      makeNote({ id: '/b.md', created_at: '2022-01-01T11:00:00', updated_at: '2022-01-01T12:00:00' }),
    ];
    expect(countNoteActivities(notes)).toEqual({
      '2022-1-1': { activityNum: 3, createNum: 2, updateNum: 1 },
      '2022-1-2': { activityNum: 1, createNum: 0, updateNum: 1 },
    });
    expect(countNoteActivities([])).toEqual({});
  });
});

describe('mergeActivities', () => {
  const stored: ActivityRecord = { '2022-1-1': { activityNum: 5, createNum: 3, updateNum: 2 } };

  test('keeps the most seen per day and adds new days', () => {
    const merged = mergeActivities(stored, {
      '2022-1-1': { activityNum: 4, createNum: 1, updateNum: 3 },
      '2022-1-2': { activityNum: 1, createNum: 1, updateNum: 0 },
    });
    expect(merged).toEqual({
      '2022-1-1': { activityNum: 5, createNum: 3, updateNum: 3 },
      '2022-1-2': { activityNum: 1, createNum: 1, updateNum: 0 },
    });
    expect(stored['2022-1-1'].updateNum).toBe(2); // not mutated
  });

  test('returns the stored record itself when nothing is raised', () => {
    expect(mergeActivities(stored, { '2022-1-1': { activityNum: 1, createNum: 1, updateNum: 0 } })).toBe(stored);
    expect(mergeActivities(stored, {})).toBe(stored);
  });
});
