import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { writeFile } from './write';
import {
  scheduleSave, flushSave, cancelSave, hasPendingSave, SAVE_DELAY_MS, MAX_WAIT_MS,
} from './pendingSaves';

vi.mock('./write', () => ({ writeFile: vi.fn(async () => undefined) }));

const written = () => vi.mocked(writeFile).mock.calls;

describe('pendingSaves', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(writeFile).mockClear();
  });

  afterEach(async () => {
    cancelSave('/a.md');
    cancelSave('/b.md');
    vi.useRealTimers();
  });

  test('writes the last content once the changes pause', async () => {
    scheduleSave('/a.md', 'a');
    scheduleSave('/a.md', 'ab');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(written()).toEqual([]);
    scheduleSave('/a.md', 'abc');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(written()).toEqual([['/a.md', 'abc']]);
    expect(hasPendingSave('/a.md')).toBe(false);
  });

  test('writes at least every MAX_WAIT_MS while the changes go on', async () => {
    for (let t = 0; t < MAX_WAIT_MS; t += 100) {
      scheduleSave('/a.md', `v${t}`);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(written()).toHaveLength(1);
    expect(written()[0][1]).toBe(`v${MAX_WAIT_MS - 100}`);
  });

  test('flush writes now, the timer does not write again', async () => {
    scheduleSave('/a.md', 'a');
    scheduleSave('/b.md', 'b');
    await flushSave('/a.md');
    expect(written()).toEqual([['/a.md', 'a']]);
    await flushSave();
    expect(written()).toEqual([['/a.md', 'a'], ['/b.md', 'b']]);
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS);
    expect(written()).toHaveLength(2);
  });

  test('a cancelled save is not written', async () => {
    scheduleSave('/a.md', 'a');
    cancelSave('/a.md');
    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS);
    expect(written()).toEqual([]);
  });

  test('the writes of a path are done in order', async () => {
    const order: string[] = [];
    let finishFirst = () => {};
    vi.mocked(writeFile)
      .mockImplementationOnce(async (_, content) => {
        await new Promise<void>((resolve) => { finishFirst = resolve; });
        order.push(content);
      })
      .mockImplementationOnce(async (_, content) => { order.push(content); });

    scheduleSave('/a.md', 'first');
    const first = flushSave('/a.md');
    scheduleSave('/a.md', 'second');
    const second = flushSave('/a.md');
    await vi.advanceTimersByTimeAsync(0);
    // the second one waits for the first one
    expect(order).toEqual([]);
    finishFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
  });

  test('flush waits for a write already started', async () => {
    let finish = () => {};
    vi.mocked(writeFile).mockImplementationOnce(
      () => new Promise<void>((resolve) => { finish = resolve; })
    );
    scheduleSave('/a.md', 'a');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    let flushed = false;
    const flush = flushSave('/a.md').then(() => { flushed = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(flushed).toBe(false);
    finish();
    await flush;
    expect(flushed).toBe(true);
  });

  test('leaving the window saves at once', async () => {
    scheduleSave('/a.md', 'a');
    window.dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(0);
    expect(written()).toEqual([['/a.md', 'a']]);
  });
});
