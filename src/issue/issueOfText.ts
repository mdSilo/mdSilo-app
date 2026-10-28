import { store } from '@/state/store';
import { encodeHref } from '@/lib/mdlink';
import { issueStore } from './issueStore';
import { issueHref } from './refs';

/** The text in one line, cut to a title. */
export const oneLine = (text: string, max = 80) => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/** A link to a note, `[[title]]` if it can be. */
const noteLink = (title: string) =>
  /[[\]|\n]/.test(title) ? `[${title.replace(/[[\]]/g, '')}](${encodeHref(title)})` : `[[${title}]]`;

/**
 * Make an issue of a text of a note: the text quoted with a link back to the
 * note, the note linked to the issue too.
 * @returns the link to the issue, to put in the note
 */
export async function issueOfNoteText(text: string, noteId: string, noteTitle: string) {
  const ws = store.getState().initDir;
  if (!ws || !text.trim()) return undefined;
  const quote = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => `> ${l}`).join('\n');
  await issueStore.getState().load(ws);
  const num = issueStore.getState().createIssue({
    title: oneLine(text),
    body: `${quote}\n>\n> — ${noteLink(noteTitle)}`,
    notes: [noteId],
  });
  return { title: `#${num}`, href: issueHref(num) };
}
