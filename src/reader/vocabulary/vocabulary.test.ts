import { invoke } from '@tauri-apps/api/core';
import { useWebFs } from '../../testUtils';
import {
  definitionOf, readVocabulary, resetVocabulary, sameWord, sentenceAround, sentenceRangeAround, useVocabulary,
} from './vocabulary';

const WS = '/mdSilo';

beforeEach(async () => {
  await useWebFs();
  resetVocabulary();
});

describe('vocabulary', () => {
  test('keeps the words in the workspace, once each, the newest first', async () => {
    const { add, remove, recordReview } = useVocabulary.getState();
    await add(WS, { word: ' Bright ', definition: '<p>shining</p>', language: 'English' });
    await add(WS, { word: 'cold', definition: '', language: 'English' });
    await add(WS, { word: 'bright', definition: 'again', language: 'English' });
    expect(useVocabulary.getState().entries.map((e) => e.word)).toEqual(['cold', 'Bright']);
    const file = JSON.parse(await invoke<string>('read_file', { filePath: `${WS}/.mdsilo/vocabulary.json` }));
    expect(file.version).toBe(1);
    expect(file.entries).toHaveLength(2);

    const bright = useVocabulary.getState().entries[1];
    await recordReview(WS, bright.id);
    await recordReview(WS, bright.id);
    expect(useVocabulary.getState().entries[1]).toMatchObject({ reviewCount: 2 });
    await remove(WS, [bright.id]);
    expect((await readVocabulary(WS)).map((e) => e.word)).toEqual(['cold']);
  });

  test('a change made to the file as it is, changed by another device', async () => {
    await useVocabulary.getState().add(WS, { word: 'one', definition: '' });
    // synced meanwhile
    const synced = { version: 1, entries: [{ id: 'x', word: 'other', definition: '', addedAt: '' }] };
    await invoke('write_file', { filePath: `${WS}/.mdsilo/vocabulary.json`, text: JSON.stringify(synced) });
    await useVocabulary.getState().add(WS, { word: 'two', definition: '' });
    expect(useVocabulary.getState().entries.map((e) => e.word)).toEqual(['two', 'other']);
  });

  test('the same word', () => {
    expect(sameWord({ word: 'Day' }, { word: 'day ', language: 'English' })).toBe(true);
    expect(sameWord({ word: 'pain', language: 'French' }, { word: 'pain', language: 'English' })).toBe(false);
  });

  test('the definition kept: the first meanings, escaped', () => {
    expect(definitionOf({
      word: 'cold', url: '',
      entries: [{ language: 'English', meanings: [
        { partOfSpeech: 'Adjective', definitions: ['Having a low temperature.', 'Unfriendly.', 'Third.'] },
        { partOfSpeech: '<Noun>', definitions: ['A low temperature.'] },
      ] }],
    })).toEqual({
      language: 'English',
      definition: '<p><i>Adjective</i> Having a low temperature. Unfriendly.</p><p><i>&lt;Noun&gt;</i> A low temperature.</p>',
    });
    expect(definitionOf({ word: 'x', url: '', entries: [] })).toEqual({ definition: '' });
  });

  test('the sentence a word is in', () => {
    document.body.innerHTML = '<p>It was a bright cold day in April. The clocks were <em>striking</em> thirteen! Then</p>';
    const p = document.querySelector('p')!;
    const range = document.createRange();
    const text = p.firstChild!;
    range.setStart(text, 9);
    range.setEnd(text, 15);
    expect(sentenceAround(range)).toBe('It was a bright cold day in April.');
    const em = document.querySelector('em')!.firstChild!;
    range.setStart(em, 0);
    range.setEnd(em, 8);
    expect(sentenceAround(range)).toBe('The clocks were striking thirteen!');
    expect(sentenceAround(undefined)).toBeUndefined();

    // a long one: the words around
    document.body.innerHTML = `<p>${'word '.repeat(100)}target ${'more '.repeat(100)}end.</p>`;
    const long = document.querySelector('p')!.firstChild!;
    range.setStart(long, 500);
    range.setEnd(long, 506);
    const around = sentenceAround(range)!;
    expect(around.startsWith('… word')).toBe(true);
    expect(around.endsWith('more …')).toBe(true);
    expect(around).toContain('target');
    expect(around.length).toBeLessThan(340);
  });

  test('the range of the sentence a word is in, across the elements', () => {
    document.body.innerHTML = '<p>It was a bright cold day in April. The clocks were <em>striking</em> thirteen! Then</p>';
    const text = document.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 16);
    range.setEnd(text, 20);
    expect(sentenceRangeAround(range)?.toString()).toBe('It was a bright cold day in April.');
    const em = document.querySelector('em')!.firstChild!;
    range.setStart(em, 0);
    range.setEnd(em, 8);
    const sentence = sentenceRangeAround(range)!;
    expect(sentence.toString()).toBe('The clocks were striking thirteen!');
    expect(sentence.startContainer).toBe(text);
    expect(sentence.endContainer).toBe(em.parentElement!.nextSibling);
    expect(sentenceRangeAround(sentence)?.toString()).toBe(sentence.toString());
  });
});
