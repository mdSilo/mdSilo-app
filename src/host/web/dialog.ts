/**
 * Web stand-in of `@tauri-apps/plugin-dialog`, aliased in vite.web.config.ts.
 */
import { initFs } from './fs';
import { dialogStyle, el, pick } from './picker';

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  title?: string;
  filters?: DialogFilter[];
  defaultPath?: string;
  multiple?: boolean;
  directory?: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  filters?: DialogFilter[];
  defaultPath?: string;
}

export async function open(options: OpenDialogOptions = {}): Promise<string | string[] | null> {
  await initFs();
  const extensions = options.directory ? [] : (options.filters ?? []).flatMap((f) => f.extensions);
  const res = await pick({
    mode: options.directory ? 'dir' : 'file',
    title: options.title,
    multiple: Boolean(options.multiple),
    extensions,
    defaultPath: options.defaultPath,
  });
  if (!res || res.length === 0) return null;
  return options.multiple && !options.directory ? res : res[0];
}

export async function save(options: SaveDialogOptions = {}): Promise<string | null> {
  await initFs();
  const res = await pick({ mode: 'save', title: options.title, defaultPath: options.defaultPath });
  return res?.[0] ?? null;
}

/** A plain DOM message box, with a Cancel button when `cancel`. Resolves true on OK. */
function messageBox(msg: string, title: string | undefined, cancel: boolean): Promise<boolean> {
  const { color, btnStyle } = dialogStyle();
  return new Promise((resolve) => {
    const overlay = el('div', {
      position: 'fixed', inset: '0', zIndex: '9999', display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)',
    });
    overlay.setAttribute('data-testid', 'web-message-box');
    const box = el('div', {
      width: 'min(420px, 92vw)', padding: '16px', background: color.bg, color: color.fg,
      borderRadius: '8px', fontSize: '14px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
    });
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    if (title) box.appendChild(el('div', { fontWeight: '600', marginBottom: '8px' }, title));
    box.appendChild(el('div', { whiteSpace: 'pre-wrap' }, msg));
    const footer = el('div', { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' });
    const cancelBtn = el('button', btnStyle, 'Cancel');
    const okBtn = el('button', { ...btnStyle, background: color.primary, borderColor: color.primary, color: '#fff' }, 'OK');
    if (cancel) footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);
    box.appendChild(footer);
    overlay.appendChild(box);

    const close = (ok: boolean) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(ok);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      close(e.key === 'Enter' || !cancel);
    };
    cancelBtn.onclick = () => close(false);
    okBtn.onclick = () => close(true);
    overlay.onclick = (e) => { if (e.target === overlay) close(!cancel); };
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    okBtn.focus();
  });
}

export async function message(msg: string, options?: { title?: string } | string): Promise<void> {
  const title = typeof options === 'string' ? options : options?.title;
  await messageBox(msg, title, false);
}

export async function ask(msg: string, options?: { title?: string } | string): Promise<boolean> {
  const title = typeof options === 'string' ? options : options?.title;
  return messageBox(msg, title, true);
}

export const confirm = ask;
