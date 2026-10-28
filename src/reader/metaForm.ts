import type { BookEntry, BookMeta } from './library';

/** The metadata of a book edited in a form, as text: as in readup. */
export type Form = Record<'title' | 'subtitle' | 'author' | 'series' | 'seriesIndex' | 'seriesTotal' | 'publisher'
  | 'published' | 'language' | 'identifier' | 'subjects' | 'description', string>;

export const formOf = (book: BookEntry): Form => ({
  title: book.title ?? '',
  subtitle: book.subtitle ?? '',
  author: book.author ?? '',
  series: book.series ?? '',
  seriesIndex: book.seriesIndex?.toString() ?? '',
  seriesTotal: book.seriesTotal?.toString() ?? '',
  publisher: book.publisher ?? '',
  published: book.published ?? '',
  language: book.language?.join(', ') ?? '',
  identifier: book.identifier ?? '',
  subjects: book.subjects?.join(', ') ?? '',
  description: book.description ?? '',
});

const list = (text: string) => text.split(/[,;，、]/).map((s) => s.trim()).filter(Boolean);
const number = (text: string) => {
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : undefined;
};

/** The errors of the form, by field. */
export function validateMeta(form: Form): Partial<Record<keyof Form, string>> {
  const errors: Partial<Record<keyof Form, string>> = {};
  if (!form.title.trim()) errors.title = 'A title is needed';
  if (form.published.trim() && !/^\d{4}(-\d{2}(-\d{2})?)?([T ][\d:.]+Z?([+-][\d:]+)?)?$/.test(form.published.trim())) {
    errors.published = 'As YYYY, YYYY-MM or YYYY-MM-DD';
  }
  if (list(form.language).some((code) => !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(code))) {
    errors.language = 'Language codes, e.g. en, zh-CN';
  }
  for (const field of ['seriesIndex', 'seriesTotal'] as const) {
    if (form[field].trim() && number(form[field]) === undefined) errors[field] = 'A number';
  }
  return errors;
}

/** The metadata of the form, '' as none. */
export function metaOfForm(form: Form): BookMeta {
  const text = (value: string) => value.trim() || undefined;
  const languages = list(form.language);
  const subjects = list(form.subjects);
  return {
    title: form.title.trim(),
    author: form.author.trim(),
    subtitle: text(form.subtitle),
    series: text(form.series),
    seriesIndex: number(form.seriesIndex),
    seriesTotal: number(form.seriesTotal),
    publisher: text(form.publisher),
    published: text(form.published),
    language: languages.length ? languages : undefined,
    identifier: text(form.identifier),
    subjects: subjects.length ? subjects : undefined,
    description: text(form.description),
  };
}
