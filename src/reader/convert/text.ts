import { buildEpub, escapeXml, hrefOf, type TocEntry } from './epub';

/**
 * Plain text as a book, after readup's TxtToEpubConverter: the encoding
 * found, the chapters by their headings (第一章, Chapter 1...), the volumes
 * (第一卷, Part One...) above them; without headings, parts of about the
 * same length.
 */

/** The text of a file: UTF-8 (or UTF-16, by its BOM); else GB18030, as Chinese text files often are. */
export function decodeText(data: Uint8Array): string {
  if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) return new TextDecoder('utf-8').decode(data.subarray(3));
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder('utf-16le').decode(data.subarray(2));
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder('utf-16be').decode(data.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    try {
      return new TextDecoder('gb18030').decode(data);
    } catch {
      return new TextDecoder('utf-8').decode(data);
    }
  }
}

/** The language of a text, by its script: zh, ja, ko, or en. */
export function guessLanguage(text: string): string {
  const sample = text.slice(0, 5000);
  const count = (re: RegExp) => sample.match(re)?.length ?? 0;
  const letters = count(/[\p{L}]/gu) || 1;
  if (count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) / letters > 0.05) return 'ja';
  if (count(/\p{Script=Hangul}/gu) / letters > 0.2) return 'ko';
  if (count(/\p{Script=Han}/gu) / letters > 0.2) return 'zh';
  return 'en';
}

const CJK_NUMBER = '零〇一二两兩三四五六七八九十百千万萬壹贰貳叁參肆伍陆陸柒捌玖拾佰仟0-9０-９';
const SEP = '[\\s\\u3000:：、.．·—-]';
const CJK_CHAPTER = new RegExp(`^第[${CJK_NUMBER}]+[章回节節集幕话話篇](?:${SEP}+.*)?$`);
const CJK_VOLUME = new RegExp(`^第[${CJK_NUMBER}]+[卷部册冊](?:${SEP}+.*)?$`);
const CJK_SPECIAL = /^(序|序章|序言|自序|楔子|引子|前言|后记|後記|尾声|尾聲|终章|終章|番外.{0,20}|跋)$/;
const EN_NUMBER = '\\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[a-z]+-[a-z]+|[a-z]+teen|[a-z]+ty';
const EN_CHAPTER = new RegExp(`^(chapter\\s+(${EN_NUMBER})\\b|prologue\\b|epilogue\\b)[\\s.:—-]*.*$`, 'i');
const EN_VOLUME = new RegExp(`^(part|book|volume)\\s+(${EN_NUMBER})\\b[\\s.:—-]*.*$`, 'i');

/** A line of a heading: of a 'volume' (above the chapters), of a 'chapter', or not. */
export function headingOf(line: string): 'volume' | 'chapter' | undefined {
  if (line.length > 50 || /[。！？!?」"”]$/.test(line)) return undefined;
  if (CJK_VOLUME.test(line) || EN_VOLUME.test(line)) return 'volume';
  if (CJK_CHAPTER.test(line) || CJK_SPECIAL.test(line) || EN_CHAPTER.test(line)) return 'chapter';
  return undefined;
}

export type TextChapter = { title: string; level: 1 | 2; paragraphs: string[] };

/**
 * Lines broken at a width (as in Project Gutenberg), the paragraphs between
 * blank lines; else (as Chinese novels) a paragraph a line.
 */
function isHardWrapped(lines: string[]) {
  const full = lines.filter((l) => l.trim());
  if (full.length < 20) return false;
  const blank = lines.length - full.length;
  const lengths = full.map((l) => l.length).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];
  return blank > full.length * 0.1 && median >= 45 && median <= 90;
}

/** The paragraphs of a text, the leading spaces (half or full width) trimmed. */
export function paragraphsOf(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  if (!isHardWrapped(lines)) return lines.map((l) => l.trim()).filter(Boolean);
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) paragraphs.push(current.join(' '));
    current = [];
  };
  for (const line of lines) {
    const t = line.trim();
    // a heading alone on its line, as a paragraph
    if (!t || headingOf(t)) {
      flush();
      if (t) paragraphs.push(t);
    } else current.push(t);
  }
  flush();
  return paragraphs;
}

/** chars of a part of a text without headings */
const PART_SIZE = 20000;

/** The chapters of a text, by its headings; the text before them first, titled `title`. */
export function chaptersOf(text: string, title: string): TextChapter[] {
  const paragraphs = paragraphsOf(text);
  const chapters: TextChapter[] = [{ title, level: 2, paragraphs: [] }];
  let headings = 0;
  for (const p of paragraphs) {
    const kind = headingOf(p);
    if (kind) {
      headings++;
      chapters.push({ title: p, level: kind === 'volume' ? 1 : 2, paragraphs: [] });
    } else chapters[chapters.length - 1].paragraphs.push(p);
  }
  if (headings >= 2) {
    // a list of the chapters at the start (a contents): headings without text, kept as text
    const kept: TextChapter[] = [];
    for (let i = 0; i < chapters.length; i++) {
      const c = chapters[i];
      const empty = c.paragraphs.length === 0 && c.level === 2 && i > 0;
      const next = chapters[i + 1];
      if (empty && next && kept.length) kept[kept.length - 1].paragraphs.push(c.title);
      else kept.push(c);
    }
    return kept.filter((c, i) => i > 0 || c.paragraphs.length > 0);
  }
  // no headings: parts of about the same length, titled by their first words
  const parts: TextChapter[] = [];
  let size = PART_SIZE;
  for (const p of paragraphs) {
    if (size >= PART_SIZE) {
      parts.push({ title: parts.length ? p.slice(0, 24) + (p.length > 24 ? '…' : '') : title, level: 2, paragraphs: [] });
      size = 0;
    }
    parts[parts.length - 1].paragraphs.push(p);
    size += p.length;
  }
  return parts.length ? parts : [{ title, level: 2, paragraphs: [] }];
}

/** The body of a chapter of text, XHTML. */
export const textBody = (c: TextChapter, heading = true) =>
  (heading ? `<h${c.level}>${escapeXml(c.title)}</h${c.level}>` : '')
  + c.paragraphs.map((p) => `<p>${escapeXml(p)}</p>`).join('\n');

/** The style of a text: paragraphs indented, as in a printed book. */
export const TEXT_CSS = `
p { text-indent: 2em; margin: 0 0 0.4em; }
h1, h2 { text-align: center; margin: 1em 0; }
`;

/**
 * The title and author in the name of a text file, as Chinese novels are
 * named: 《书名》作者：张三.txt, 《书名》[张三].txt; else the name.
 */
export function titleOfTextFile(name: string): { title: string; author?: string } {
  const base = name.replace(/\.[^.]+$/, '');
  const m = base.match(/《([^》]+)》(.*)/);
  const labeled = (s: string) => s.match(/作者\s*[：:\s]\s*(.+)$/)?.[1];
  const clean = (s?: string) => s?.replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '') || undefined;
  if (!m) return { title: base, author: clean(labeled(base)) };
  const rest = m[2].trim();
  const author = labeled(rest) ?? rest.match(/[[(（【［]\s*([^\])）】］]+?)\s*[\])）】］]/)?.[1] ?? rest;
  return { title: m[1].trim(), author: clean(author) };
}

/** The author in the first lines of a text, as 作者：张三; a short name only. */
export function authorInText(text: string): string | undefined {
  const head = text.slice(0, 1024);
  const m = head.match(/[【[]?作者[】\]]?\s*[:：]\s*(.+)/) ?? head.match(/^\s*by\s+(.+)$/im);
  const name = m?.[1].trim().replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
  return name && name.length <= 30 && !/[:：]|\d{4,}/.test(name) ? name : undefined;
}

/** The EPUB of a TXT file. */
export async function txtToBook(name: string, data: Uint8Array): Promise<Uint8Array> {
  const text = decodeText(data);
  const { title, author } = titleOfTextFile(name);
  const chapters = chaptersOf(text, title);
  return buildEpub({
    title,
    author: authorInText(text) ?? author,
    language: guessLanguage(text),
    chapters: chapters.map((c, i) => ({ path: `text/${i + 1}.xhtml`, title: c.title, body: textBody(c) })),
    toc: tocOfText(chapters),
    css: TEXT_CSS,
  });
}

/** The contents of a text: the chapters under their volumes. */
function tocOfText(chapters: TextChapter[]): TocEntry[] {
  const toc: TocEntry[] = [];
  let volume: TocEntry | undefined;
  chapters.forEach((c, i) => {
    const entry = { label: c.title, href: hrefOf(`text/${i + 1}.xhtml`) };
    if (c.level === 1) {
      volume = { ...entry, children: [] };
      toc.push(volume);
    } else if (volume) volume.children!.push(entry);
    else toc.push(entry);
  });
  return toc.map((e) => (e.children?.length ? e : { label: e.label, href: e.href }));
}
