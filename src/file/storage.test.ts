import { afterEach, beforeEach, describe, expect, test, type Mock } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { enterTauri, leaveTauri, mockInvoke } from '../testUtils';
import Storage, { set, get, remove, setLog, getLog, clearLog } from './storage';

describe('web storage', () => {
  test('set/get/remove round-trip through localStorage as JSON', async () => {
    await set('key', { a: 1 });
    expect(localStorage.getItem('key')).toBe('{"a":1}');
    await expect(get('key')).resolves.toEqual({ a: 1 });
    await remove('key');
    expect(localStorage.getItem('key')).toBeNull();
  });

  test('get returns an empty object for missing keys', async () => {
    await expect(get('missing')).resolves.toEqual({});
  });

  test('default export exposes the same functions', () => {
    expect(Storage).toEqual({ set, get, remove });
  });
});

describe('log commands', () => {
  test('setLog sends a timestamped entry', async () => {
    (invoke as Mock).mockResolvedValueOnce(true);
    await expect(setLog('Error', 'boom')).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith('set_log', {
      logData: [{ ty: 'Error', info: 'boom', timestamp: expect.any(String) }],
    });
  });

  test('getLog and clearLog', async () => {
    const logs = [{ ty: 'info', info: 'x', timestamp: 't' }];
    (invoke as Mock).mockResolvedValueOnce(logs);
    await expect(getLog()).resolves.toBe(logs);
    expect(invoke).toHaveBeenCalledWith('get_log');
    await clearLog();
    expect(invoke).toHaveBeenCalledWith('del_log');
  });
});

describe('tauri storage', () => {
  let storage: typeof import('./storage');
  let tauriInvoke: Mock;

  beforeEach(async () => {
    enterTauri();
    tauriInvoke = (await import('@tauri-apps/api/core')).invoke as Mock;
    mockInvoke(tauriInvoke, { get_data: { status: false } });
    storage = await import('./storage');
  });

  afterEach(() => {
    leaveTauri();
  });

  test('set and remove invoke the backend', async () => {
    await storage.set('k', 'v');
    expect(tauriInvoke).toHaveBeenCalledWith('set_data', { key: 'k', value: 'v' });
    await storage.remove('k');
    expect(tauriInvoke).toHaveBeenCalledWith('delete_data', { key: 'k' });
    expect(localStorage.getItem('k')).toBeNull();
  });

  test('get returns data when the backend has it', async () => {
    mockInvoke(tauriInvoke, { get_data: { status: true, data: { x: 1 } } });
    await expect(storage.get('k')).resolves.toEqual({ x: 1 });
    expect(tauriInvoke).toHaveBeenCalledWith('get_data', { key: 'k' });
  });

  test('get returns an empty object when the backend has nothing', async () => {
    await expect(storage.get('k')).resolves.toEqual({});
  });
});
