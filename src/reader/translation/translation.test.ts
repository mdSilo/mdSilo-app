import { fromRange, parse, toRange } from 'foliate-js/epubcfi.js';
import { readZip } from '../convert';
import { makeEpub } from '../testBook';
import {
  blocksAround, blocksOf, keyOf, removeTranslations, showTranslation, sourceTextOf, translatedCount, translatedEpub,
  TRANSLATION_CLASS,
} from './translation';

const page = (html: string) => {
  document.body.innerHTML = html;
  return document.body;
};

describe('a book translated as it is read', () => {
  test('the paragraphs of a page: with text of their own, not code', () => {
    const body = page(`
      <h1>Title</h1>
      <div><p>One <em>two</em></p><p><span>Three</span></p></div>
      <pre><code>let x = 1</code></pre>
      <section><div><p>Four</p></div></section>`);
    expect(blocksOf(body).map((b) => b.textContent)).toEqual(['Title', 'One two', 'Three', 'Four']);
  });

  test('under the paragraph, or in place of it; removed, the text as it was', () => {
    const body = page('<p id="p">It was a <b>bright</b>   cold day.</p>');
    const p = body.querySelector('#p')!;
    const before = p.innerHTML;
    expect(sourceTextOf(p)).toBe('It was a bright cold day.');

    showTranslation(p, 'Il faisait froid.', 'fr', false);
    const added = p.querySelector(`.${TRANSLATION_CLASS}`)!;
    expect(added.textContent).toBe('Il faisait froid.');
    // invisible to CFIs; the text the same, to look it up
    expect(added.hasAttribute('cfi-inert')).toBe(true);
    expect(added.getAttribute('lang')).toBe('fr');
    expect(sourceTextOf(p)).toBe('It was a bright cold day.');
    // not a paragraph of its own
    expect(blocksOf(body)).toEqual([p]);
    // once
    showTranslation(p, 'Encore', 'fr', false);
    expect(p.querySelectorAll(`.${TRANSLATION_CLASS}`)).toHaveLength(1);
    removeTranslations(document);
    expect(p.innerHTML).toBe(before);

    // the translation only: the text hidden in a wrapper the CFIs skip
    showTranslation(p, 'Il faisait froid.', 'fr', true);
    const hider = p.querySelector('[cfi-skip]')!;
    expect(hider.innerHTML).toBe(before);
    expect(sourceTextOf(p)).toBe('It was a bright cold day.');
    expect(blocksOf(body)).toEqual([p]);
    removeTranslations(document);
    expect(p.innerHTML).toBe(before);
    // the style, once
    expect(document.querySelectorAll('#mdsilo-translation-style')).toHaveLength(1);
  });

  test('the places in the text the same: a highlight on it found again, translated or not', () => {
    const body = page('<p>First <b>bold</b> text.</p><p id="q">Second one here.</p>');
    const q = body.querySelector('#q')!;
    const range = document.createRange();
    range.setStart(q.firstChild!, 7);
    range.setEnd(q.firstChild!, 10);
    const cfi = fromRange(range);
    for (const only of [false, true]) {
      for (const p of blocksOf(body)) showTranslation(p, 'Traduit.', 'fr', only);
      // the CFI of the same text the same, and back to the same text
      const now = document.createRange();
      now.setStart(q.querySelector('[cfi-skip]')?.firstChild ?? q.firstChild!, 7);
      now.setEnd(q.querySelector('[cfi-skip]')?.firstChild ?? q.firstChild!, 10);
      expect(fromRange(now)).toBe(cfi);
      expect(toRange(document, parse(cfi)).toString()).toBe('one');
      removeTranslations(document);
    }
  });

  test('the paragraphs of the page shown, some before and more after', () => {
    const body = page(Array.from({ length: 12 }, (_, i) => `<p>P${i}</p>`).join(''));
    const blocks = blocksOf(body);
    const range = document.createRange();
    range.setStart(blocks[5].firstChild!, 0);
    range.setEnd(blocks[6].firstChild!, 1);
    expect(blocksAround(blocks, range).map((b) => b.textContent)).toEqual(['P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11']);
    // no page known: the first ones
    expect(blocksAround(blocks, undefined)).toHaveLength(5);
  });

  test('the translations kept, made a book', async () => {
    const epub = new Uint8Array(await makeEpub().arrayBuffer());
    const translations = { [keyOf('Chapter 1')]: 'Chapitre 1', 'It was a bright cold day in April.': 'Il faisait froid en avril.' };
    const count = await translatedCount(epub, translations);
    expect(count).toEqual({ total: 4, done: 2, missing: ['Chapter 2', 'The clocks were striking thirteen.'] });

    const read = async (data: Uint8Array) => new Map((await readZip(data)).map((f) => [f.name, new TextDecoder().decode(f.data)]));
    const under = await read(await translatedEpub(epub, translations, 'fr', false));
    expect(under.get('OEBPS/c1.xhtml')).toContain('It was a bright cold day in April.<span class="mdsilo-translation" lang="fr"');
    expect(under.get('OEBPS/c1.xhtml')).toContain('Il faisait froid en avril.</span></p>');
    expect(under.get('OEBPS/c2.xhtml')).toContain('<p>The clocks were striking thirteen.</p>');
    expect(under.get('OEBPS/content.opf')).toContain('<dc:title>Tiny Book (fr)</dc:title>');
    expect(under.get('OEBPS/content.opf')).toContain('urn:uuid:tiny-fr');
    expect(under.get('OEBPS/content.opf')).toContain('<dc:language>en</dc:language>');
    // the mimetype first, as an EPUB has it
    expect([...under.keys()][0]).toBe('mimetype');

    // a translation the same as the text: not added again
    const same = await read(await translatedEpub(epub, { ...translations, 'Chapter 2': 'Chapter 2' }, 'fr', false));
    expect(same.get('OEBPS/c2.xhtml')).toContain('<h1>Chapter 2</h1>');

    const only = await read(await translatedEpub(epub, translations, 'fr', true));
    expect(only.get('OEBPS/c1.xhtml')).toContain('<h1 lang="fr" xml:lang="fr">Chapitre 1</h1>');
    expect(only.get('OEBPS/c1.xhtml')).not.toContain('bright cold');
    // not all translated: the book in its language, the paragraphs translated in theirs
    expect(only.get('OEBPS/content.opf')).toContain('<dc:language>en</dc:language>');
    const all = { ...translations, 'Chapter 2': 'Chapitre 2', 'The clocks were striking thirteen.': 'Treize heures.' };
    const whole = await read(await translatedEpub(epub, all, 'fr', true));
    expect(whole.get('OEBPS/content.opf')).toContain('<dc:language>fr</dc:language>');
  });
});
