/**
 * A plain DOM dialog to pick files / folders in the virtual file system,
 * stands in for the native file dialog. Files or folders on the device can be
 * imported into the virtual file system as well.
 */
import * as fs from './fs';
import { ROOT, basename, extname, isTextFile, join, normalize, parent } from './path';

export type PickMode = 'file' | 'dir' | 'save';

export interface PickOptions {
  mode: PickMode;
  title?: string;
  multiple?: boolean;
  extensions?: string[];
  defaultPath?: string;
}

/** write files from device into dir, return written paths */
export async function importFiles(files: File[], dir: string, keepRelative: boolean): Promise<string[]> {
  const written: string[] = [];
  for (const file of files) {
    const rel = keepRelative && file.webkitRelativePath ? file.webkitRelativePath : file.name;
    const path = join(dir, rel);
    const data = isTextFile(path) ? await file.text() : new Blob([file], { type: file.type });
    if (await fs.writeFile(path, data)) written.push(path);
  }
  return written;
}

async function initialDir(defaultPath?: string): Promise<[string, string]> {
  if (defaultPath) {
    const p = normalize(defaultPath);
    const entry = await fs.stat(p);
    if (entry?.is_dir) return [p, ''];
    if (await fs.isDir(parent(p))) return [parent(p), basename(p)];
  }
  return [(await fs.isDir(fs.DEFAULT_DIR)) ? fs.DEFAULT_DIR : ROOT, defaultPath ? basename(defaultPath) : ''];
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function pick(options: PickOptions): Promise<string[] | null> {
  const { mode, multiple = false } = options;
  const exts = (options.extensions ?? []).map((e) => e.toLowerCase()).filter((e) => e && e !== '*');
  const dark = Boolean(document.querySelector('.dark'));
  const color = {
    bg: dark ? '#1f2937' : '#ffffff',
    fg: dark ? '#f3f4f6' : '#111827',
    muted: dark ? '#9ca3af' : '#6b7280',
    border: dark ? '#374151' : '#e5e7eb',
    hover: dark ? '#374151' : '#f3f4f6',
    selected: dark ? '#1e3a8a' : '#dbeafe',
    primary: '#2563eb',
  };
  const btnStyle: Partial<CSSStyleDeclaration> = {
    padding: '4px 10px',
    border: `1px solid ${color.border}`,
    borderRadius: '4px',
    background: 'transparent',
    color: color.fg,
    cursor: 'pointer',
    fontSize: '13px',
  };

  return new Promise((resolve) => {
    let cwd = ROOT;
    let selected: string[] = [];

    const overlay = el('div', {
      position: 'fixed', inset: '0', zIndex: '9998', display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)',
    });
    overlay.setAttribute('data-testid', 'web-file-picker');
    const box = el('div', {
      width: 'min(560px, 92vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      background: color.bg, color: color.fg, borderRadius: '8px', fontSize: '14px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.3)', overflow: 'hidden',
    });
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    overlay.appendChild(box);

    const header = el('div', { padding: '12px 16px', fontWeight: '600', borderBottom: `1px solid ${color.border}` },
      options.title || (mode === 'dir' ? 'Open Folder' : mode === 'save' ? 'Save' : 'Open File'));
    const hint = el('div', { padding: '0 16px 8px', fontSize: '12px', color: color.muted },
      'Files are stored in this browser (IndexedDB).');

    const toolbar = el('div', { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' });
    const upBtn = el('button', btnStyle, '↑ Up');
    const pathLabel = el('div', { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: color.muted });
    const newDirBtn = el('button', btnStyle, '+ New Folder');
    toolbar.append(upBtn, pathLabel, newDirBtn);

    const list = el('div', {
      flex: '1', minHeight: '200px', overflowY: 'auto', margin: '0 16px',
      border: `1px solid ${color.border}`, borderRadius: '4px',
    });
    list.setAttribute('role', 'listbox');

    const nameRow = el('div', { display: mode === 'save' ? 'flex' : 'none', alignItems: 'center', gap: '8px', padding: '8px 16px 0' });
    const nameInput = el('input', {
      flex: '1', padding: '4px 8px', border: `1px solid ${color.border}`, borderRadius: '4px',
      background: 'transparent', color: color.fg,
    });
    nameInput.placeholder = 'Name';
    nameInput.setAttribute('aria-label', 'Name');
    nameRow.append(el('span', {}, 'Name:'), nameInput);

    const footer = el('div', { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px' });
    const status = el('div', { flex: '1', fontSize: '12px', color: color.muted });
    const uploadInput = el('input', { display: 'none' });
    uploadInput.type = 'file';
    if (mode === 'dir') {
      uploadInput.setAttribute('webkitdirectory', '');
      uploadInput.multiple = true;
    } else {
      uploadInput.multiple = multiple;
      if (exts.length) uploadInput.accept = exts.map((e) => `.${e}`).join(',');
    }
    const uploadBtn = el('button', { ...btnStyle, display: mode === 'save' ? 'none' : '' },
      mode === 'dir' ? 'Import Folder…' : 'Upload…');
    uploadBtn.title = 'Import from your device into this browser';
    const cancelBtn = el('button', btnStyle, 'Cancel');
    const okBtn = el('button', { ...btnStyle, background: color.primary, borderColor: color.primary, color: '#fff' },
      mode === 'dir' ? 'Select Folder' : mode === 'save' ? 'Save' : 'Open');
    footer.append(uploadBtn, uploadInput, status, cancelBtn, okBtn);

    box.append(header, hint, toolbar, list, nameRow, footer);

    const close = (result: string[] | null) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(result);
    };

    const confirm = () => {
      if (mode === 'dir') {
        close([cwd]);
      } else if (mode === 'save') {
        const name = nameInput.value.trim();
        if (name) close([join(cwd, name)]);
      } else if (selected.length) {
        close(selected);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      } else if (e.key === 'Enter' && (mode !== 'file' || selected.length)) {
        e.preventDefault();
        e.stopPropagation();
        confirm();
      }
    };

    const updateOk = () => {
      okBtn.disabled = mode === 'file' && selected.length === 0;
      okBtn.style.opacity = okBtn.disabled ? '0.5' : '1';
    };

    const render = async () => {
      pathLabel.textContent = cwd;
      upBtn.disabled = cwd === ROOT;
      upBtn.style.opacity = upBtn.disabled ? '0.5' : '1';
      const entries = (await fs.readDir(cwd))
        .filter((e) => !e.name.startsWith('.'))
        .filter((e) => e.is_dir || mode === 'save' || (mode === 'file' && (!exts.length || exts.includes(extname(e.name)))))
        .sort((a, b) => (a.is_dir === b.is_dir ? a.name.localeCompare(b.name) : a.is_dir ? -1 : 1));
      list.replaceChildren();
      if (entries.length === 0) {
        list.appendChild(el('div', { padding: '12px', color: color.muted }, 'Empty folder'));
      }
      for (const entry of entries) {
        const isSelected = selected.includes(entry.path);
        const row = el('div', {
          display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: 'pointer',
          background: isSelected ? color.selected : 'transparent',
        });
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(isSelected));
        row.append(el('span', {}, entry.is_dir ? '📁' : '📄'), el('span', {}, entry.name));
        row.onmouseenter = () => { if (!selected.includes(entry.path)) row.style.background = color.hover; };
        row.onmouseleave = () => { if (!selected.includes(entry.path)) row.style.background = 'transparent'; };
        row.onclick = () => {
          if (entry.is_dir) {
            cwd = entry.path;
            selected = [];
          } else if (mode === 'save') {
            nameInput.value = entry.name;
            return;
          } else if (multiple) {
            selected = isSelected ? selected.filter((p) => p !== entry.path) : [...selected, entry.path];
          } else {
            selected = [entry.path];
          }
          updateOk();
          void render();
        };
        if (!entry.is_dir && mode === 'file') {
          row.ondblclick = () => close([entry.path]);
        }
        list.appendChild(row);
      }
      updateOk();
    };

    upBtn.onclick = () => {
      cwd = parent(cwd);
      selected = [];
      void render();
    };
    newDirBtn.onclick = async () => {
      const name = window.prompt('New folder name')?.trim();
      if (!name) return;
      const dir = join(cwd, name);
      if (await fs.mkdirp(dir)) {
        cwd = dir;
        selected = [];
      }
      void render();
    };
    uploadBtn.onclick = () => uploadInput.click();
    uploadInput.onchange = async () => {
      const files = Array.from(uploadInput.files ?? []);
      uploadInput.value = '';
      if (!files.length) return;
      status.textContent = `Importing ${files.length} file(s)…`;
      const written = await importFiles(files, cwd, mode === 'dir');
      status.textContent = `Imported ${written.length} file(s)`;
      if (mode === 'dir') {
        // enter the imported folder
        const top = files[0].webkitRelativePath?.split('/')[0];
        if (top && (await fs.isDir(join(cwd, top)))) cwd = join(cwd, top);
      } else {
        const matched = written.filter((p) => !exts.length || exts.includes(extname(p)));
        selected = multiple ? matched : matched.slice(0, 1);
      }
      void render();
    };
    cancelBtn.onclick = () => close(null);
    okBtn.onclick = confirm;
    overlay.onclick = (e) => { if (e.target === overlay) close(null); };
    document.addEventListener('keydown', onKey, true);

    void initialDir(options.defaultPath).then(([dir, name]) => {
      cwd = dir;
      nameInput.value = name;
      document.body.appendChild(overlay);
      if (mode === 'save') nameInput.focus();
      return render();
    });
  });
}
