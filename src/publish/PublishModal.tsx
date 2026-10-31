import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import type { PublishOptions } from 'mdsilo-publish';
import { useStore } from '@/state/store';
import { BaseModal } from '@/ui/BaseModal';
import { Spinner, Toggle } from '@/ui/ui';
import { checkFileIsMd } from '@/workspace/process';
import { syncInfo } from '@/sync/api';
import { useIssueStore } from '@/issue/issueStore';
import {
  buildSiteTo, noteFolders, publishSite, readPublishOptions, relativeTo, usePublishUi, writePublishOptions,
  type Built, type Pushed,
} from './publish';

type Kind = 'backlinks' | 'graph' | 'tags' | 'books' | 'issues' | 'journals' | 'math' | 'mermaid' | 'echarts' | 'smiles';

const CONTENT: [Kind, string, string][] = [
  ['backlinks', 'Backlinks', 'the published notes linking to a note'],
  ['graph', 'Graph', 'the links between the pages'],
  ['tags', 'Tag pages', 'a page per #tag#'],
  ['journals', 'Journals', 'the daily notes, on the home page'],
  ['books', 'Book annotations', 'the highlights and notes of every annotated book, not the books'],
  ['issues', 'Issues', 'with their timeline, milestones and project boards'],
];

/** Drawn when publishing, so the site loads no library. */
const DRAWN: [Kind, string, string][] = [
  ['math', 'Math', '$...$ and $$...$$, as MathML'],
  ['mermaid', 'Mermaid', 'diagrams, as pictures'],
  ['echarts', 'ECharts', 'charts, as pictures'],
  ['smiles', 'SMILES', 'chemical structures, as pictures'],
];

/** Choose what to publish, then export the site or push it to GitHub Pages. */
export default function PublishModal() {
  const isOpen = usePublishUi((s) => s.isOpen);
  const ws = useStore((state) => state.initDir);
  const notes = useStore((state) => state.notes);
  const [options, setOptions] = useState<PublishOptions>();
  const [canPush, setCanPush] = useState(false);
  const [busy, setBusy] = useState<'export' | 'publish'>();
  const [result, setResult] = useState<(Built & Partial<Pushed>) & { target?: string }>();
  const [error, setError] = useState<string>();
  const handleClose = () => usePublishUi.setState({ isOpen: false });
  const labels = useIssueStore((s) => s.data.labels);

  useEffect(() => {
    if (!isOpen || !ws) return;
    setResult(undefined);
    setError(undefined);
    void readPublishOptions(ws).then(setOptions);
    void useIssueStore.getState().load(ws);
    void syncInfo(ws).then((info) => setCanPush(Boolean(info.isRepo && info.remoteUrl))).catch(() => setCanPush(false));
  }, [isOpen, ws]);

  const folders = useMemo(() => (isOpen && ws ? noteFolders(ws, notes.values()) : []), [isOpen, ws, notes]);
  // before the front matter is read: the notes in the folders ticked
  const count = useMemo(() => {
    if (!ws || !options) return 0;
    const ticked = options.folders.map((f) => `${f}/`);
    return notes.values().filter((n) => {
      const path = !n.is_dir && checkFileIsMd(n.id) ? relativeTo(ws, n.id) : undefined;
      return path && ticked.some((f) => path.startsWith(f));
    }).length;
  }, [ws, options, notes]);

  if (!ws) return null;

  const update = (next: PublishOptions) => {
    setOptions(next);
    void writePublishOptions(ws, next).catch((e) => setError(String(e)));
  };
  const toggleFolder = (folder: string, on: boolean) => {
    if (!options) return;
    // a folder ticked has its sub folders: they go with it
    const rest = options.folders.filter((f) => f !== folder && !f.startsWith(`${folder}/`));
    update({ ...options, folders: on ? [...rest, folder].sort() : rest });
  };
  const isTicked = (folder: string) => options?.folders.some((f) => folder === f || folder.startsWith(`${f}/`)) ?? false;
  const run = async (kind: 'export' | 'publish') => {
    if (!options) return;
    setError(undefined);
    setResult(undefined);
    try {
      if (kind === 'export') {
        const target = await open({ directory: true, title: 'Export the site to' });
        if (typeof target !== 'string') return;
        setBusy(kind);
        setResult({ ...(await buildSiteTo(ws, options, target)), target });
      } else {
        setBusy(kind);
        setResult(await publishSite(ws, options));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <BaseModal title="Publish" isOpen={isOpen} handleClose={handleClose} panelClassName="max-w-md">
      {options ? (
        <div className="flex flex-col gap-3 p-3 text-sm text-left bg-base-200">
          <p className="text-base-content/80">
            A static site of the notes in the folders ticked. A note can opt out with <code>publish: false</code> in
            its front matter, or in from elsewhere with <code>publish: true</code>. Links to notes not published
            show as plain text.
          </p>
          <label className="flex flex-col gap-1">
            <span>Site title</span>
            <input
              className="input input-sm w-full"
              value={options.title}
              onChange={(e) => setOptions({ ...options, title: e.target.value })}
              onBlur={() => update(options)}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span>Folders <span className="text-base-content/70">({count} notes)</span></span>
            <div className="flex flex-col max-h-48 overflow-y-auto p-2 rounded-sm bg-base-100">
              {folders.length ? folders.map((folder) => {
                const depth = folder.split('/').length - 1;
                const parentTicked = depth > 0 && isTicked(folder.split('/').slice(0, -1).join('/'));
                return (
                  <label key={folder} className="flex items-center gap-2" style={{ paddingLeft: `${depth}em` }}>
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={isTicked(folder)}
                      disabled={parentTicked}
                      onChange={(e) => toggleFolder(folder, e.target.checked)}
                    />
                    {folder.split('/').pop()}
                  </label>
                );
              }) : <span className="text-base-content/70">No folders of notes</span>}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span>With</span>
            {CONTENT.map(([kind, name, hint]) => (
              <Toggle
                key={kind}
                label={<span>{name} <span className="text-xs text-base-content/70">{hint}</span></span>}
                ariaLabel={name}
                checked={options[kind] as boolean}
                onChange={(on) => update({ ...options, [kind]: on })}
              />
            ))}
          </div>

          {options.issues && labels.length ? (
            <div className="flex flex-col gap-1">
              <span>
                Only the issues labeled <span className="text-base-content/70">(none ticked: all issues)</span>
              </span>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {labels.map((label) => (
                  <label key={label.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={options.issueLabels.includes(label.name)}
                      onChange={(e) => {
                        const rest = options.issueLabels.filter((l) => l !== label.name);
                        update({ ...options, issueLabels: e.target.checked ? [...rest, label.name] : rest });
                      }}
                    />
                    {label.name}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <span>Draw</span>
            {DRAWN.map(([kind, name, hint]) => (
              <Toggle
                key={kind}
                label={<span>{name} <span className="text-xs text-base-content/70">{hint}</span></span>}
                ariaLabel={name}
                checked={options[kind] as boolean}
                onChange={(on) => update({ ...options, [kind]: on })}
              />
            ))}
          </div>

          {error ? <div role="alert" className="break-words text-error">{error}</div> : null}
          {result ? <Result result={result} /> : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn btn-sm" disabled={!!busy} onClick={() => void run('export')}>
              {busy === 'export' ? <Spinner size="xs" color="neutral" /> : null}
              Export to folder…
            </button>
            <button
              className="btn btn-sm btn-primary"
              disabled={!!busy || !canPush}
              title={canPush ? undefined : 'Set up the sync first: the site goes to its remote'}
              onClick={() => void run('publish')}
            >
              {busy === 'publish' ? <Spinner size="xs" color="neutral" /> : null}
              Publish to GitHub Pages
            </button>
          </div>
          {!canPush ? (
            <p className="text-xs text-base-content/70">To publish, set up the sync: the site goes to the gh-pages branch of its remote.</p>
          ) : null}
        </div>
      ) : (
        <div className="p-3"><Spinner size="sm" /></div>
      )}
    </BaseModal>
  );
}

function Result({ result }: { result: Built & Partial<Pushed> & { target?: string } }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-success">
        {result.pages} pages {result.branch ? `pushed to ${result.branch}` : `written to ${result.target}`}
      </span>
      {result.url ? (
        <span>
          <button className="link link-primary" onClick={() => void invoke('open_url', { url: result.url })}>{result.url}</button>
          <span className="block text-xs text-base-content/70">
            Once: in the repository settings, Pages, deploy from the branch gh-pages. Then it may take a minute.
          </span>
        </span>
      ) : null}
      {result.missing.length ? (
        <span className="text-xs text-warning">Not found, left out: {result.missing.join(', ')}</span>
      ) : null}
    </div>
  );
}
