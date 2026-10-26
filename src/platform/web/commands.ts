/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Web implementations of the Rust commands in src-tauri/src/lib.rs,
 * files are stored in IndexedDB instead of the disk.
 */
import { partialMd5 } from '../../utils/partialMd5';
import * as fs from './fs';
import * as feed from './feed';
import { KV, del, get, put } from './idb';
import { basename, fileStem, isTextNote, join, normalize, parent } from './path';
import { emitChanges, watchDir } from './watch';
import { downloadBlob, fileUrl, showMessage } from './browser';
import { exportBackup } from './backup';
import * as indexer from './indexer';

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

async function sameContent(a: string, b: string): Promise<boolean> {
  const [blobA, blobB] = await Promise.all([fs.readBlob(a), fs.readBlob(b)]);
  if (blobA.size !== blobB.size) return false;
  const [bytesA, bytesB] = await Promise.all([blobA.arrayBuffer(), blobB.arrayBuffer()]);
  const viewB = new Uint8Array(bytesB);
  return new Uint8Array(bytesA).every((byte, i) => byte === viewB[i]);
}

/**
 * Copy to the `assets` dir of the work dir, as the desktop app: never replace
 * another file of the same name, `name-1.ext`, `name-2.ext`... are tried; the
 * file itself or a copy of it is used as is.
 */
async function copyFileToAssets(srcPath: string, workDir: string): Promise<[string, string]> {
  if (!(await fs.isFile(srcPath))) return ['', ''];
  const src = normalize(srcPath);
  const name = basename(srcPath);
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? name : `${stem}-${i}${ext}`;
    const toPath = join(workDir, 'assets', candidate);
    if (!(await fs.exists(toPath))) {
      return (await fs.copyFile(src, toPath)) ? [toPath, `./assets/${candidate}`] : ['', ''];
    }
    if (src === toPath || (await sameContent(src, toPath))) {
      return [toPath, `./assets/${candidate}`];
    }
  }
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
  add_starred_articles: ({ articles }) => feed.addStarredArticles(articles ?? []),
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
  // the index, src-tauri/src/index
  index_open: ({ dir }) => indexer.indexOpen(dir),
  index_update: ({ paths }) => indexer.indexUpdate(paths ?? []),
  index_search: ({ query, kind, limit }) => indexer.indexSearch(query ?? '', kind ?? undefined, limit ?? 50),
  index_book: ({ hash, title, sections }) => indexer.indexBook(hash, title ?? '', sections ?? []),
  index_book_indexed: ({ hash }) => indexer.indexBookIndexed(hash),
  // books, src-tauri/src/books.rs
  book_hash: ({ filePath }) => fs.readBlob(filePath).then(partialMd5).catch(() => ''),
  read_file_bytes: async ({ filePath }) => (await fs.readBlob(filePath)).arrayBuffer(),
  write_file_bytes: ({ filePath, data }) => fs.writeFile(filePath, new Blob([new Uint8Array(data ?? [])])),
  // web only: back up notes in IndexedDB to a zip file
  export_backup: ({ dir }) => exportBackup(dir ?? '/'),
};
