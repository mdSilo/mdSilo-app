import { invoke } from '@tauri-apps/api/core';
import { store } from '@/state/store';
import { useWebFs } from '@/testUtils';
import * as ops from './issueOps';
import { issueChanges, joinIssueData, splitIssueData } from './issueFiles';
import { issueDirOf, issueStore, resetIssueStore } from './issueStore';

const WS = '/mdSilo';
const read = (path: string) => invoke<string>('read_file', { filePath: path });
const list = async (dir: string) =>
  (await invoke<{ file_name: string }[]>('list_directory', { dir })).map((e) => e.file_name).sort();

beforeEach(async () => {
  await useWebFs();
});

afterEach(() => {
  resetIssueStore();
});

describe('issue files', () => {
  test('splits and joins the data', () => {
    const data = ops.createIssue(ops.createIssue(ops.defaultIssueData(), { title: 'a' }), { title: 'b' });
    const { meta, issues } = splitIssueData(data);
    expect(meta).not.toHaveProperty('issues');
    expect(meta.nextNumber).toBe(3);
    // in any order, as read from the dir
    const joined = joinIssueData(meta, [issues[1], issues[0]]);
    expect(joined.issues.map((i) => i.title)).toEqual(['a', 'b']);
    expect(joined.labels).toEqual(data.labels);
  });

  test('changes are found by reference', () => {
    const one = ops.createIssue(ops.defaultIssueData(), { title: 'a' });
    const two = ops.createIssue(one, { title: 'b' });
    expect(issueChanges(undefined, one)).toEqual({ write: one.issues, remove: [], meta: true });
    const added = issueChanges(one, two);
    expect(added.write.map((i) => i.title)).toEqual(['b']);
    expect(added.meta).toBe(true); // nextNumber
    const commented = ops.addComment(two, 1, 'hi');
    expect(issueChanges(two, commented)).toEqual({ write: [commented.issues[0]], remove: [], meta: false });
    const deleted = ops.deleteIssue(commented, 2);
    expect(issueChanges(commented, deleted)).toMatchObject({ write: [], remove: [2] });
    expect(issueChanges(deleted, ops.createLabel(deleted, { name: 'x', color: '#000' })).meta).toBe(true);
  });

  test('a workspace stores one file per issue, writing the changes only', async () => {
    store.setState({ initDir: WS, layout: 'workspace' });
    await issueStore.getState().load(WS);
    const dir = issueDirOf(WS);
    expect(dir).toBe('/mdSilo/.mdsilo/issues');

    issueStore.getState().createIssue({ title: 'one' });
    issueStore.getState().createIssue({ title: 'two' });
    issueStore.getState().apply((d) => ops.linkNote(d, 1, `${WS}/writing/a.md`));
    await issueStore.getState().flush();
    expect(await list(dir)).toEqual(['1.json', '2.json', 'meta.json']);
    const one = JSON.parse(await read(`${dir}/1.json`));
    expect(one.title).toBe('one');
    // relative to the workspace
    expect(one.notes).toEqual(['writing/a.md']);
    expect(JSON.parse(await read(`${dir}/meta.json`)).nextNumber).toBe(3);

    // only #2 is written
    await invoke('write_file', { filePath: `${dir}/1.json`, text: '{"number":1,"title":"edited elsewhere"}' });
    issueStore.getState().apply((d) => ops.addComment(d, 2, 'hi'));
    await issueStore.getState().flush();
    expect(JSON.parse(await read(`${dir}/1.json`)).title).toBe('edited elsewhere');
    expect(JSON.parse(await read(`${dir}/2.json`)).timeline).toHaveLength(2);

    issueStore.getState().apply((d) => ops.deleteIssue(d, 2));
    await issueStore.getState().flush();
    expect(await list(dir)).toEqual(['1.json', 'meta.json']);

    // read back, with absolute paths
    resetIssueStore();
    await issueStore.getState().load(WS);
    const { data } = issueStore.getState();
    expect(data.issues.map((i) => i.title)).toEqual(['edited elsewhere']);
    expect(data.nextNumber).toBe(3);
  });

  test('a broken issue file does not lose the others', async () => {
    const dir = issueDirOf(WS);
    await invoke('write_file', { filePath: `${dir}/1.json`, text: '{"number":1,"title":"ok","notes":["writing/n.md"]}' });
    await invoke('write_file', { filePath: `${dir}/2.json`, text: '{broken' });
    await invoke('write_file', { filePath: `${dir}/notes.txt`, text: 'not an issue' });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await issueStore.getState().load(WS, true, 'workspace');
    expect(err).toHaveBeenCalled();
    const { data } = issueStore.getState();
    expect(data.issues.map((i) => i.title)).toEqual(['ok']);
    expect(data.issues[0].notes).toEqual(['/mdSilo/writing/n.md']);
    expect(data.nextNumber).toBe(2);
  });

  test('a workspace without issues has the defaults and writes nothing', async () => {
    await issueStore.getState().load(WS, false, 'workspace');
    expect(issueStore.getState().data.projects[0].title).toBe('Default');
    expect(await invoke('is_dir', { path: issueDirOf(WS) })).toBe(false);
  });
});
