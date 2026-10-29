import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { vi } from 'vitest';
import { closeDB } from './idb';
import * as fs from './fs';
import { DEFAULT_DIR, resetFsInit } from './fs';
import { loadDemo } from './demo';
import { hasDemo, removeDemo } from './demoClear';

const at = (path: string) => `${DEFAULT_DIR}/${path}`;
const json = async (path: string) => JSON.parse(await fs.readText(at(path)));

async function install(lang: 'en' | 'zh' = 'en') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob([new Uint8Array(3000).fill(7)]) }));
  for (const file of await loadDemo(lang)) await fs.writeFile(at(file.path), file.data);
}

beforeEach(async () => {
  await closeDB();
  resetFsInit();
  globalThis.indexedDB = new IDBFactory();
});
afterEach(() => vi.unstubAllGlobals());

describe('remove the demo', () => {
  it('has none in a workspace without it', async () => {
    expect(await hasDemo()).toBe(false);
    expect(await removeDemo()).toBe(false);
  });

  it.each(['en', 'zh'] as const)('removes all of the demo, %s', async (lang) => {
    await install(lang);
    expect(await hasDemo()).toBe(true);
    expect(await removeDemo()).toBe(true);
    expect(await hasDemo()).toBe(false);

    const left = (await fs.walk(DEFAULT_DIR)).filter((e) => !e.is_dir).map((e) => e.path.slice(DEFAULT_DIR.length + 1));
    expect(left.filter((p) => p.startsWith('writing/') && p !== 'writing/Welcome.md')).toEqual([]);
    expect(left.filter((p) => p.startsWith('reading/') && !p.endsWith('.gitignore'))).toEqual([]);
    expect(left).not.toContain('.mdsilo/issues/1.json');
    const meta = await json('.mdsilo/issues/meta.json');
    expect(meta.projects).toEqual([]);
    expect(meta.milestones).toEqual([]);
    // the labels of any workspace stay
    expect(meta.labels.map((l: { name: string }) => l.name)).toEqual(['bug', 'enhancement']);
    expect((await json('.mdsilo/books.json')).books).toEqual({});
  });

  it('keeps what you added', async () => {
    await install();
    // your own issue with a label of the demo, in the project of the demo
    const mine = { number: 4, title: 'mine', labels: ['demo-idea'], timeline: [{ id: 'mine-e' }] };
    await fs.writeFile(at('.mdsilo/issues/4.json'), JSON.stringify(mine));
    const meta = await json('.mdsilo/issues/meta.json');
    meta.projects[0].items.push({ issue: 4, status: 'toread', order: 0 });
    await fs.writeFile(at('.mdsilo/issues/meta.json'), JSON.stringify(meta));
    await fs.writeFile(at('writing/My note.md'), 'mine');
    await fs.writeFile(at('writing/Manual/My own page.md'), 'in the folder of the manual');

    expect(await removeDemo()).toBe(true);

    expect(await fs.readText(at('writing/My note.md'))).toBe('mine');
    expect(await json('.mdsilo/issues/4.json')).toEqual(mine);
    expect(await fs.exists(at('.mdsilo/issues/2.json'))).toBe(false);
    const after = await json('.mdsilo/issues/meta.json');
    expect(after.labels.map((l: { id: string }) => l.id)).toContain('demo-idea');
    expect(after.labels.map((l: { id: string }) => l.id)).not.toContain('demo-question');
    expect(after.projects).toHaveLength(1);
    expect(after.projects[0].items).toEqual([{ issue: 4, status: 'toread', order: 0 }]);
  });

  it('keeps the issues of the demo you changed', async () => {
    await install();
    // the first event is the mark of an issue not made by you: one you wrote over is yours
    await fs.writeFile(at('.mdsilo/issues/3.json'), JSON.stringify({ number: 3, title: 'my own', timeline: [] }));
    await removeDemo();
    expect(await fs.exists(at('.mdsilo/issues/3.json'))).toBe(true);
    expect(await fs.exists(at('.mdsilo/issues/1.json'))).toBe(false);
  });
});
