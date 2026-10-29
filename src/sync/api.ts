import { invoke } from '@tauri-apps/api/core';
import { isTauri, isWeb } from '@/workspace/util';

/**
 * Sync of the workspace with a git remote (GitHub, Gitea...) over HTTPS with
 * a token, see src-tauri/src/sync. Desktop and mobile only for now: the web
 * version would implement these commands in host/web (e.g. isomorphic-git
 * over the CORS proxy), and turn `isSyncAvailable` on.
 */
export const isSyncAvailable = isTauri && !isWeb;

export type SyncInfo = {
  /** sync is set up: the workspace is a git repo */
  isRepo: boolean;
  branch?: string;
  remoteUrl?: string;
  username?: string;
  hasToken: boolean;
  authorName?: string;
  authorEmail?: string;
  /** the files changed since the last sync */
  changes: number;
};

export type SyncSetup = {
  url: string;
  username?: string;
  /** undefined: keep the token saved; '': forget it */
  token?: string;
  authorName?: string;
  authorEmail?: string;
};

export type ConflictReport = {
  /** relative to the workspace, with `/` */
  path: string;
  /** where this device's version was kept, beside the file */
  copy?: string;
};

export type SyncReport = {
  committed: boolean;
  /** the files changed by the remote, relative to the workspace */
  pulled: string[];
  pushed: boolean;
  conflicts: ConflictReport[];
};

export const syncInfo = (dir: string) => invoke<SyncInfo>('sync_info', { dir });

export const syncSetup = (dir: string, setup: SyncSetup) => invoke<SyncInfo>('sync_setup', { dir, setup });

export const syncRun = (dir: string) => invoke<SyncReport>('sync_run', { dir });
