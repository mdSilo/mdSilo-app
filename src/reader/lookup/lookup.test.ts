import {
  baseLanguage, lookupWikipedia, lookupWiktionary, targetLanguage, translate, translateUrl, translatorOf, TRANSLATORS,
} from './lookup';

const respond = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, statusText: String(status), json: async () => body }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookup', () => {
  test('languages', () => {
    expect(baseLanguage('zh-Hans')).toBe('zh');
    expect(baseLanguage(undefined)).toBe('en');
    expect(targetLanguage('fr')).toBe('fr');
    expect(targetLanguage('')).toBe(navigator.language || 'en');
  });

  test('Wiktionary: the entries of the book language first, sanitized', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      en: [{ partOfSpeech: 'Noun', language: 'English', definitions: [{ definition: 'A <b>cat</b><img src=x onerror=alert(1)>' }] }],
      fr: [{ partOfSpeech: 'Noun', language: 'French', definitions: [{ definition: 'chat' }, { definition: '' }] }],
    }));
    const res = await lookupWiktionary(' chat ', 'fr-FR');
    expect(fetchMock.mock.calls[0][0]).toBe('https://en.wiktionary.org/api/rest_v1/page/definition/chat?redirect=true');
    expect(res.word).toBe('chat');
    expect(res.entries.map((e) => e.language)).toEqual(['French', 'English']);
    expect(res.entries[0].meanings[0].definitions).toEqual(['chat']);
    expect(res.entries[1].meanings[0].definitions[0]).not.toContain('onerror');
  });

  test('Wiktionary: no entry', async () => {
    fetchMock.mockResolvedValueOnce(respond({}, 404));
    expect((await lookupWiktionary('zzz')).entries).toEqual([]);
  });

  test('Wikipedia: the summary in the book language', async () => {
    fetchMock.mockResolvedValueOnce(respond({
      title: 'Tea', extract: 'Tea is a drink.', content_urls: { desktop: { page: 'https://zh.wikipedia.org/wiki/Tea' } },
    }));
    const res = await lookupWikipedia('Tea', 'zh-CN');
    expect(fetchMock.mock.calls[0][0]).toBe('https://zh.wikipedia.org/api/rest_v1/page/summary/Tea?redirect=true');
    expect(res).toEqual({ title: 'Tea', extract: 'Tea is a drink.', url: 'https://zh.wikipedia.org/wiki/Tea' });
    fetchMock.mockResolvedValueOnce(respond({}, 404));
    expect(await lookupWikipedia('Nothing here')).toBeUndefined();
    fetchMock.mockResolvedValueOnce(respond({}, 500));
    await expect(lookupWikipedia('x')).rejects.toThrow('500');
  });

  test('translate', async () => {
    fetchMock.mockResolvedValueOnce(respond([[['Bonjour ', 'Hello '], ['le monde', 'world']], null, 'en']));
    const res = await translate('Hello world', 'fr');
    expect(res).toEqual({ text: 'Bonjour le monde', from: 'en', to: 'fr', url: translateUrl('Hello world', 'fr') });
    fetchMock.mockResolvedValueOnce(respond([[]]));
    await expect(translate('x', 'fr')).rejects.toThrow('No translation');
  });

  test('the service to translate by: as chosen, else the first', () => {
    expect(translatorOf('google')).toBe(TRANSLATORS[0]);
    expect(translatorOf(undefined).name).toBe('google');
    expect(translatorOf('gone').name).toBe('google');
    expect(translatorOf('google').url('Hi', 'fr')).toBe(translateUrl('Hi', 'fr'));
  });
});
