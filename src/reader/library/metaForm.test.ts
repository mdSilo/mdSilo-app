import { formOf, metaOfForm, validateMeta } from './metaForm';
import type { BookEntry } from './library';

const entry: BookEntry = {
  hash: 'h', file: 'reading/a.epub', title: 'Dune', author: 'Frank Herbert', format: 'EPUB', addedAt: '',
  seriesIndex: 1, language: ['en'], subjects: ['SF', 'Deserts'],
};

describe('the metadata form', () => {
  test('from the entry and back', () => {
    const form = formOf(entry);
    expect(form).toMatchObject({ title: 'Dune', seriesIndex: '1', language: 'en', subjects: 'SF, Deserts', publisher: '' });
    expect(metaOfForm({ ...form, subjects: 'SF; Space，Deserts、Sand', seriesTotal: '6', publisher: '  ' })).toMatchObject({
      title: 'Dune', seriesIndex: 1, seriesTotal: 6, subjects: ['SF', 'Space', 'Deserts', 'Sand'], publisher: undefined,
    });
  });

  test('validated', () => {
    const form = formOf(entry);
    expect(validateMeta(form)).toEqual({});
    expect(validateMeta({ ...form, title: ' ', published: '65', language: 'en, english!', seriesIndex: 'one' })).toEqual({
      title: 'A title is needed',
      published: 'As YYYY, YYYY-MM or YYYY-MM-DD',
      language: 'Language codes, e.g. en, zh-CN',
      seriesIndex: 'A number',
    });
    for (const published of ['1965', '1965-08', '1965-08-01', '1965-08-01T00:00:00Z']) {
      expect(validateMeta({ ...form, published })).toEqual({});
    }
  });
});
