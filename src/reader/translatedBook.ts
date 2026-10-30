import { fromWorkspacePath, toWorkspacePath } from '@/workspace/util';
import { bookHashOf, readLibrary, saveBookEntry, writeBytes } from './library';
import { useReaderStore, useSideStore } from './readerStore';
import type { Translator } from './lookup';
import type { BookTranslations } from './translation';

/** The file of the translated book: beside the book, the language before the extension. */
export const translatedPathOf = (path: string, lang: string) =>
  `${path.replace(/\.[^./\\]+$/, '')}.${lang}.epub`;

/**
 * Translate the paragraphs not translated yet, a few at a time, each kept as
 * it comes: stopped by `signal`, or by failures in a row (the service
 * refusing so many).
 */
export async function translateMissing(
  missing: string[], translator: Translator, lang: string, kept: BookTranslations, scope: string,
  onProgress: (done: number) => void, signal: AbortSignal,
): Promise<void> {
  let next = 0;
  let done = 0;
  let failures = 0;
  let error: unknown;
  const worker = async () => {
    while (!signal.aborted && next < missing.length && failures < 3) {
      const key = missing[next++];
      try {
        kept.set(scope, key, (await translator.translate(key, lang)).text);
        failures = 0;
      } catch (e) {
        failures++;
        error = e;
      }
      onProgress(++done);
    }
  };
  await Promise.all([worker(), worker()]);
  await kept.flush();
  if (failures >= 3) throw error instanceof Error ? error : new Error(String(error));
}

/**
 * The translated book (an EPUB, see translation.ts and bookToEpub.ts) written
 * beside the book and in the library, the book left as it is; made again, it
 * is the same book (its notes, its place).
 */
export async function saveTranslatedBook(
  ws: string, path: string, title: string, author: string, epub: Uint8Array, lang: string,
): Promise<string> {
  const target = translatedPathOf(path, lang);
  const file = toWorkspacePath(ws, target);
  const entry = Object.values((await readLibrary(ws)).books).find((b) => b.file === file);
  // open in the reader: closed, opened again it is the new one
  for (const reader of [useReaderStore, useSideStore]) {
    if (reader.getState().path === target) await reader.getState().close();
  }
  if (!(await writeBytes(target, epub))) throw new Error(`Failed to write ${file}`);
  const fileHash = await bookHashOf(target);
  if (entry) {
    await saveBookEntry(ws, { hash: entry.hash, fileHash: fileHash !== entry.hash ? fileHash : undefined });
  } else {
    await saveBookEntry(ws, {
      hash: fileHash, file, title: `${title} (${lang})`, author, format: 'EPUB',
      addedAt: new Date().toISOString(),
    });
  }
  return fromWorkspacePath(ws, file);
}
