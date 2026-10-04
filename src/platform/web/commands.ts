/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Web implementations of the Rust commands in src-tauri/src/lib.rs,
 * files are stored in IndexedDB instead of the disk.
 */
import * as fs from './fs';
import * as feed from './feed';
import { KV, del, get, put } from './idb';
import { basename, fileStem, isTextNote, join, normalize, parent } from './path';
import { emitChanges, watchDir } from './watch';
import { downloadBlob, fileUrl, showMessage } from './browser';
import { exportBackup } from './backup';

type Args = Record<string, any>;
type Command = (args: Args) => unknown;

interface LogItem {
  ty: string;
  info: string;
  timestamp: string;
}

// # storage, src-tauri/src/storage.rs
async function getData(key: string) {
  const data = await get<unknown>(KV, key);
  return data === undefined ? { status: false, data: null } : { status: true, data };
}

async function getLog(): Promise<LogItem[]> {
  const res = await getData('log');
  return (res.data as { logs?: LogItem[] } | null)?.logs ?? [];
}

// # json, src-tauri/src/json.rs, src-tauri/src/tree/mod.rs
interface NoteTreeItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  is_dir: boolean;
}

async function writeJson(dir: string): Promise<boolean> {
  const root = normalize(dir);
  const rootEntry = await fs.stat(root);
  const notesobj: Record<string, unknown> = {};
  const notetree: Record<string, NoteTreeItem[]> = {};
  if (rootEntry?.is_dir) {
    notetree[root] = [];
    const entries = await fs.walk(root, true);
    for (const e of entries) {
      if (e.is_dir) notetree[e.path] ??= [];
    }
    for (const e of entries) {
      const title = fileStem(e.name);
      const created_at = new Date(e.created).toISOString();
      const updated_at = new Date(e.modified).toISOString();
      notesobj[e.path] = {
        id: e.path,
        title,
        content: !e.is_dir && isTextNote(e.path) && typeof e.data === 'string' ? e.data : '',
        file_path: e.path,
        cover: '',
        created_at,
        updated_at,
        is_daily: false,
        is_dir: e.is_dir,
      };
      notetree[e.parent]?.push({ id: e.path, title, created_at, updated_at, is_dir: e.is_dir });
    }
    for (const items of Object.values(notetree)) {
      items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    }
  }
  const activities = (await getData('activities')).data ?? {};
  const json = JSON.stringify({ isloaded: true, notesobj, notetree, activities });
  const res = rootEntry?.is_dir ? await fs.writeFile(join(root, 'mdsilo.json'), json) : false;
  // listen loaded event on frontend: src/file/directory.ts DirectoryAPI.listen
  emitChanges(res ? 'loaded' : 'unloaded', [root]);
  return res;
}

// # files, src-tauri/src/files.rs
async function getFileMeta(filePath: string) {
  const entry = await fs.stat(filePath);
  if (!entry) throw new Error(`Err on read meatadata: ${filePath}`);
  return fs.toMeta(entry, isTextNote(entry.path));
}

async function getDirpath(path: string): Promise<string> {
  const entry = await fs.stat(path);
  if (!entry) return '';
  return entry.is_dir ? entry.path : entry.parent;
}

async function copyFileToAssets(srcPath: string, workDir: string): Promise<[string, string]> {
  if (!(await fs.isFile(srcPath))) return ['', ''];
  const name = basename(srcPath);
  const toPath = join(workDir, 'assets', name);
  if (normalize(srcPath) !== toPath && !(await fs.copyFile(srcPath, toPath))) {
    return ['', ''];
  }
  return [toPath, `./assets/${name}`];
}

async function openUrl(url: string): Promise<boolean> {
  if (!url) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^file:/i.test(url)) {
    return Boolean(window.open(url, '_blank', 'noopener'));
  }
  // a path in the virtual file system
  const path = normalize(decodeURI(url.replace(/^file:\/\//i, '')));
  const entry = await fs.stat(path);
  if (!entry) return false;
  if (entry.is_dir) {
    showMessage('mdSilo', `Folder ${path} is stored in this browser (IndexedDB).`);
    return true;
  }
  return Boolean(window.open(fileUrl(path), '_blank', 'noopener'));
}

async function downloadFile(filePath: string, blob: number[] | Uint8Array): Promise<boolean> {
  const data = new Blob([new Uint8Array(blob)]);
  const ok = await fs.writeFile(filePath, data);
  downloadBlob(data, basename(filePath) || 'download');
  return ok;
}

export const commands: Record<string, Command> = {
  close_splashscreen: () => undefined,
  msg_dialog: ({ title, msg }) => showMessage(title, msg),
  web_window: ({ url }) => openUrl(url),
  // feed
  fetch_feed: ({ url }) => feed.fetchFeed(url),
  add_channel: ({ url, ty, title }) => feed.addChannel(url, ty, title ?? null),
  import_channels: ({ list, urlList }) => feed.importChannels(list ?? urlList ?? []),
  get_channels: () => feed.getChannels(),
  delete_channel: ({ link }) => feed.deleteChannel(link),
  add_articles_with_channel: ({ link }) => feed.addArticlesWithChannel(link),
  get_articles: ({ feedLink, readStatus, starStatus }) =>
    feed.getArticles(feedLink ?? null, readStatus ?? null, starStatus ?? null),
  get_article_by_url: ({ url }) => feed.getArticleByUrl(url),
  update_article_read_status: ({ url, status }) => feed.updateArticleReadStatus(url, status),
  update_article_star_status: ({ url, status }) => feed.updateArticleStarStatus(url, status),
  get_unread_num: () => feed.getUnreadNum(),
  update_all_read_status: ({ feedLink, readStatus }) => feed.updateAllReadStatus(feedLink, readStatus),
  // files
  read_directory: async ({ dir }) => {
    const entries = await fs.readDir(dir);
    const files = entries.map((e) => fs.toMeta(e, isTextNote(e.path)));
    return { files, number_of_files: files.length };
  },
  list_directory: async ({ dir }) => {
    const entries = await fs.readDir(dir);
    return entries.filter((e) => !e.name.startsWith('.')).map((e) => fs.toMeta(e, false));
  },
  is_dir: ({ path }) => fs.isDir(path),
  is_file: ({ path }) => fs.isFile(path),
  get_basename: async ({ filePath }) => [basename(filePath), await fs.isFile(filePath)],
  get_dirpath: ({ path }) => getDirpath(path),
  get_parent_dir: ({ path }) => parent(path),
  join_paths: ({ root, parts }) => join(root, ...(parts ?? [])),
  get_file_meta: ({ filePath }) => getFileMeta(filePath),
  file_exist: ({ filePath }) => fs.exists(filePath),
  create_dir_recursive: ({ dirPath }) => fs.mkdirp(dirPath),
  create_file: ({ filePath }) => fs.writeFile(filePath, ''),
  read_file: ({ filePath }) => fs.readText(filePath).catch(() => ''),
  write_file: ({ filePath, text }) => fs.writeFile(filePath, text ?? ''),
  download_file: ({ filePath, blob }) => downloadFile(filePath, blob ?? []),
  rename_file: ({ fromPath, toPath }) => fs.rename(fromPath, toPath),
  copy_file: ({ srcPath, toPath }) => fs.copyFile(srcPath, toPath),
  copy_file_to_assets: ({ srcPath, workDir }) => copyFileToAssets(srcPath, workDir),
  delete_files: ({ paths }) => fs.remove(paths ?? []),
  listen_dir: ({ dir }) => {
    watchDir(dir);
    return '';
  },
  open_url: ({ url }) => openUrl(url),
  open_link: ({ url }) => { void openUrl(url); },
  detect_lang: () => '',
  watch_event: ({ id, ev }) => emitChanges(ev, [id]),
  // storage
  create_mdsilo_dir: async () => {
    await fs.mkdirp(fs.DEFAULT_DIR);
    return fs.DEFAULT_DIR;
  },
  set_data: async ({ key, value }) => {
    await put(KV, value ?? null, key);
    return true;
  },
  get_data: ({ key }) => getData(key),
  delete_data: async ({ key }) => {
    await del(KV, key);
    return true;
  },
  set_log: async ({ logData }) => {
    const logs = [...(logData ?? []), ...(await getLog())].slice(0, 500);
    await put(KV, { logs }, 'log');
    return true;
  },
  get_log: () => getLog(),
  del_log: async () => {
    await del(KV, 'log');
    return true;
  },
  // json
  write_json: ({ dir }) => writeJson(dir),
  // web only: back up notes in IndexedDB to a zip file
  export_backup: ({ dir }) => exportBackup(dir ?? '/'),
};
