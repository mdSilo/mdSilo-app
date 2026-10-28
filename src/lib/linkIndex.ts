import { parser } from 'mdsmirror';
import { findNoteLinks, hrefToTitle, isNoteHref } from '@/lib/mdlink';
import type { NoteMap } from './noteMap';
import { issueLinks, noteTags, type Parsed } from './parseNote';

export type TextRun = {
  text: string;
  from: number; // offset in the block text
  link?: string; // title of the linked note, if the run is in a link to note
};

export type TextBlock = {
  text: string; // plain text of the block
  runs: TextRun[];
};

/** The text blocks of markdown, as the editor parses it, with the links to notes. */
export const getMarkdownTextBlocks = (content: string): TextBlock[] => {
  const blocks: TextBlock[] = [];

  for (const token of parser.tokenizer.parse(content, {})) {
    if (token.type !== 'inline' || !token.children?.length) {
      continue;
    }

    let text = '';
    let link: string | undefined;
    const runs: TextRun[] = [];

    for (const child of token.children) {
      if (child.type === 'link_open') {
        const href = child.attrGet('href') || '';
        // '' for the links not to note, e.g. url
        link = isNoteHref(href) ? hrefToTitle(href) : '';
      } else if (child.type === 'link_close') {
        link = undefined;
      } else if (child.type === 'text' || child.type === 'code_inline') {
        if (!child.content) continue;
        runs.push({ text: child.content, from: text.length, link });
        text += child.content;
      } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
        text += ' ';
      }
    }

    if (runs.length > 0) {
      blocks.push({ text, runs });
    }
  }

  return blocks;
};

/**
 * What a note links to and contains, computed on use, kept until it changes:
 * of its content if loaded, else as the index of the workspace parsed it.
 */
type Entry = {
  content?: string;
  parsed?: Parsed;
  blocks?: TextBlock[]; // parsed by markdown-it, the costly part
  linkTitles?: Set<string>; // titles of the notes linked
  plain?: string; // the block texts, to find mentions
  mention?: { title: string; found: boolean }; // the last title looked for
  rawLinks?: string[]; // titles linked, from the raw text (graph)
  tags?: string[];
  issues?: Set<number>;
};

const addTo = (map: Map<string, Set<string>>, key: string, id: string) => {
  let ids = map.get(key);
  if (!ids) map.set(key, (ids = new Set()));
  ids.add(id);
};

const removeFrom = (map: Map<string, Set<string>>, key: string, id: string) => {
  const ids = map.get(key);
  if (!ids) return;
  ids.delete(id);
  if (ids.size === 0) map.delete(key);
};

/**
 * The links between notes, kept up to date incrementally: syncing with the
 * notes re-parses only the notes changed since (same content, same entry).
 * Backlinks, graph, tags and issue mentions read from it.
 */
export class LinkIndex {
  private entries = new Map<string, Entry>();
  private notes: NoteMap | undefined;
  /** title linked -> the notes linking it; built on first use */
  private byTitle: Map<string, Set<string>> | undefined;
  /** notes per title, of all the notes (not dirs), even empty ones */
  private titles = new Map<string, number>();
  /** notes parsed, for tests */
  parsed = 0;

  /** Bring the index up to date with the notes. */
  sync(notes: NoteMap): void {
    if (notes === this.notes) return;
    this.notes = notes;
    this.titles.clear();
    const seen = new Set<string>();
    for (const note of notes.values()) {
      if (note.is_dir) continue;
      this.titles.set(note.title, (this.titles.get(note.title) ?? 0) + 1);
      const parsed = !note.content ? note.parsed : undefined;
      if (!note.content && !parsed) continue;
      seen.add(note.id);
      const old = this.entries.get(note.id);
      if (parsed ? old?.parsed === parsed : old?.content === note.content) continue;
      if (old) this.unindex(note.id, old);
      const entry: Entry = parsed ? { parsed } : { content: note.content };
      this.entries.set(note.id, entry);
      if (this.byTitle) this.index(note.id, entry);
    }
    for (const [id, old] of this.entries) {
      if (seen.has(id)) continue;
      this.unindex(id, old);
      this.entries.delete(id);
    }
  }

  /** A note (not a dir) has the title. */
  hasTitle(title: string): boolean {
    return (this.titles.get(title) ?? 0) > 0;
  }

  /** The content of the note is here: not only what the index tells. */
  isLoaded(id: string): boolean {
    return this.entries.get(id)?.content !== undefined;
  }

  /** The notes known by the index only: their content not loaded. */
  notLoaded(): string[] {
    return [...this.entries].filter(([, e]) => e.content === undefined).map(([id]) => id);
  }

  /** The text blocks of a note, parsed once per content; none if not loaded. */
  blocks(id: string): TextBlock[] {
    const entry = this.entries.get(id);
    if (entry?.content === undefined) return [];
    if (!entry.blocks) {
      entry.blocks = getMarkdownTextBlocks(entry.content);
      this.parsed += 1;
    }
    return entry.blocks;
  }

  /** The notes linking to any of the titles. */
  linking(titles: Iterable<string>): Set<string> {
    if (!this.byTitle) {
      this.byTitle = new Map();
      for (const [id, entry] of this.entries) this.index(id, entry);
    }
    const ids = new Set<string>();
    for (const title of titles) {
      for (const id of this.byTitle.get(title) ?? []) ids.add(id);
    }
    return ids;
  }

  /**
   * The notes loaded with the title in their text (maybe in a link); for the
   * others, the search of the index tells.
   */
  mentioning(title: string): Set<string> {
    const ids = new Set<string>();
    for (const [id, entry] of this.entries) {
      // the content first: most notes do not have it, no need to parse them
      // (a mention may be escaped or an entity in the markdown though)
      const raw = entry.content;
      if (raw === undefined) continue;
      if (!raw.includes(title) && !raw.includes('\\') && !raw.includes('&')) continue;
      if (entry.mention?.title !== title) {
        entry.plain ??= this.blocks(id).map((b) => b.text).join('\n');
        entry.mention = { title, found: entry.plain.includes(title) };
      }
      if (entry.mention.found) ids.add(id);
    }
    return ids;
  }

  /** The titles a note links to in its raw text, as the graph draws them. */
  rawLinks(id: string): string[] {
    const entry = this.entries.get(id);
    if (!entry) return [];
    if (entry.parsed) return entry.parsed.links;
    return (entry.rawLinks ??= findNoteLinks(entry.content ?? '').map((link) => link.title));
  }

  /** The #tags# of a note. */
  tags(id: string): string[] {
    const entry = this.entries.get(id);
    if (!entry) return [];
    if (entry.parsed) return entry.parsed.tags;
    return (entry.tags ??= noteTags(entry.content ?? ''));
  }

  /** The issues a note links to, [#12](issue:12). */
  issues(id: string): Set<number> {
    const entry = this.entries.get(id);
    if (!entry) return new Set();
    return (entry.issues ??= new Set(entry.parsed ? entry.parsed.issues : issueLinks(entry.content ?? '')));
  }

  private linkTitles(id: string, entry: Entry): Set<string> {
    if (!entry.linkTitles) {
      if (entry.parsed) {
        entry.linkTitles = new Set(entry.parsed.links);
      } else {
        const titles = new Set<string>();
        for (const block of this.blocks(id)) {
          for (const run of block.runs) if (run.link) titles.add(run.link);
        }
        entry.linkTitles = titles;
      }
    }
    return entry.linkTitles;
  }

  private index(id: string, entry: Entry) {
    if (!this.byTitle) return;
    for (const title of this.linkTitles(id, entry)) addTo(this.byTitle, title, id);
  }

  private unindex(id: string, entry: Entry) {
    if (!this.byTitle || !entry.linkTitles) return;
    for (const title of entry.linkTitles) removeFrom(this.byTitle, title, id);
  }
}

/** The index of the notes in the store. */
export const linkIndex = new LinkIndex();

/** The index synced with the notes. */
export function indexOf(notes: NoteMap): LinkIndex {
  linkIndex.sync(notes);
  return linkIndex;
}
