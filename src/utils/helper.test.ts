import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  regDateStr,
  getStrDate,
  strToDate,
  dateCompare,
  fmtDatetime,
  decodeHTMLEntity,
  isMobile,
  ciStringCompare,
  ciStringEqual,
  shortenString,
  countWords,
  isUrl,
  isSVG,
  getFavicon,
  genId,
  emitCustomEvent,
} from './helper';

describe('date helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('regDateStr matches yyyy-mm-dd and yyyy-m-d', () => {
    expect(regDateStr.test('2022-01-31')).toBe(true);
    expect(regDateStr.test('2022-1-3')).toBe(true);
    expect(regDateStr.test('2022-12-01')).toBe(true);
    expect(regDateStr.test('2022-13-01')).toBe(false);
    expect(regDateStr.test('2022-00-01')).toBe(false);
    expect(regDateStr.test('2022-01-32')).toBe(false);
    expect(regDateStr.test('22-01-01')).toBe(false);
    expect(regDateStr.test('2022/01/01')).toBe(false);
    expect(regDateStr.test('note 2022-01-01')).toBe(false);
  });

  test('getStrDate formats as yyyy-m-d without zero padding', () => {
    expect(getStrDate('2022-03-05T12:00:00')).toBe('2022-3-5');
    expect(getStrDate('2021-12-25T08:30:00')).toBe('2021-12-25');
  });

  test('strToDate parses valid strings in local time', () => {
    const date = strToDate('2022-3-5');
    expect(date.getFullYear()).toBe(2022);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(5);
    expect(date.getHours()).toBe(0);
  });

  test('strToDate falls back to now for invalid strings', () => {
    vi.useFakeTimers();
    const now = new Date(2023, 5, 15, 10, 0, 0);
    vi.setSystemTime(now);
    expect(strToDate('not a date').getTime()).toBe(now.getTime());
    expect(strToDate('2022-13-01').getTime()).toBe(now.getTime());
  });

  test('dateCompare returns the millisecond difference', () => {
    expect(dateCompare('2022-01-02', '2022-01-01')).toBe(86400000);
    expect(dateCompare(new Date(0), new Date(1000))).toBe(-1000);
    expect(dateCompare('2022-01-01', new Date('2022-01-01'))).toBe(0);
  });

  test('fmtDatetime treats numbers as unix seconds', () => {
    const secs = 1640995200; // 2022-01-01T00:00:00Z
    expect(fmtDatetime(secs)).toBe(fmtDatetime(new Date(secs * 1000)));
    expect(fmtDatetime('2022-01-01T00:00:00Z')).toBe(fmtDatetime(new Date(secs * 1000)));
    expect(fmtDatetime(secs)).toMatch(/2022|2021/);
  });
});

describe('decodeHTMLEntity', () => {
  test('decodes entities except amp/gt/lt/quot/apos', () => {
    const txt =
      'Lorem&gt; Ipsum &amp; is simply &lt; dummy &quot; text &apos; of the printing and typesetting &copy; industry';
    expect(decodeHTMLEntity(txt)).toBe(
      'Lorem&gt; Ipsum &amp; is simply &lt; dummy &quot; text &apos; of the printing and typesetting © industry'
    );
  });

  test('decodes numeric entities and leaves plain text alone', () => {
    expect(decodeHTMLEntity('a&#169;b')).toBe('a©b');
    expect(decodeHTMLEntity('plain text')).toBe('plain text');
  });
});

describe('isMobile', () => {
  const original = window.innerWidth;
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: original });
  });

  const setWidth = (w: number) =>
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });

  test('uses 640px as the default breakpoint', () => {
    setWidth(640);
    expect(isMobile()).toBe(true);
    setWidth(641);
    expect(isMobile()).toBe(false);
  });

  test('accepts a custom breakpoint', () => {
    setWidth(800);
    expect(isMobile(1024)).toBe(true);
    expect(isMobile(600)).toBe(false);
  });

  test('treats zero width as not mobile', () => {
    setWidth(0);
    expect(isMobile()).toBe(false);
  });
});

describe('string helpers', () => {
  test('ciStringCompare ignores case and sorts numbers naturally', () => {
    expect(ciStringCompare('abc', 'ABC')).toBe(0);
    expect(ciStringCompare('a', 'b')).toBeLessThan(0);
    expect(ciStringCompare('b', 'A')).toBeGreaterThan(0);
    expect(ciStringCompare('note2', 'note10')).toBeLessThan(0);
  });

  test('ciStringEqual', () => {
    expect(ciStringEqual('Hello', 'hello')).toBe(true);
    expect(ciStringEqual('Hello', 'world')).toBe(false);
  });

  test('shortenString keeps the centre text and marks it', () => {
    const txt =
      'Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry.';
    expect(shortenString(txt, 'dummy', 42)).toBe('m Ipsum is simply ==dummy== text of the print');
    expect(shortenString(txt, 'Ipsum', 42)).toBe('Lorem ==Ipsum== is simply dummy text of the p');
    expect(shortenString(txt, 'been', 42)).toBe('dustry. Lorem Ipsum has ==been== the industry.');
    expect(shortenString('Ipsum is simply dummy text of the print', 'dummy', 42)).toBe(
      'Ipsum is simply ==dummy== text of the print'
    );
  });

  test('shortenString marks every occurrence in short text', () => {
    expect(shortenString('a b a', 'a')).toBe('==a== b ==a==');
  });

  test('countWords counts latin words', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('hello world')).toBe(2);
    expect(countWords('  hello   big\nworld  ')).toBe(3);
    expect(countWords('it is 2022.')).toBe(3);
  });

  test('countWords counts each CJK character as a word', () => {
    expect(countWords('你好')).toBe(2);
    expect(countWords('hello 你好 world')).toBe(4);
  });
});

describe('url helpers', () => {
  test('isUrl accepts only http(s) URLs', () => {
    expect(isUrl('https://mdsilo.com')).toBe(true);
    expect(isUrl('http://localhost:3000/a?b=c')).toBe(true);
    expect(isUrl('ftp://mdsilo.com')).toBe(false);
    expect(isUrl('file:///home/user/a.md')).toBe(false);
    expect(isUrl('my note')).toBe(false);
    expect(isUrl('')).toBe(false);
  });

  test('isSVG detects inline svg markup', () => {
    expect(isSVG('<svg viewBox="0 0 1 1"><path/></svg>')).toBe(true);
    expect(isSVG('< svg>x</ svg>')).toBe(true);
    expect(isSVG('<div>no</div>')).toBe(false);
  });

  test('getFavicon builds a duckduckgo icon url', () => {
    expect(getFavicon('https://mdsilo.com/blog/post')).toBe(
      'https://icons.duckduckgo.com/ip3/mdsilo.com.ico'
    );
    expect(getFavicon('')).toBe('https://icons.duckduckgo.com/ip3/.ico');
  });
});

describe('genId', () => {
  test('returns a timestamp by default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(123456789);
    expect(genId()).toBe(123456789);
    vi.useRealTimers();
  });

  test('returns an 8-char alphanumeric string when num is false', () => {
    const id = genId(false);
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[a-zA-Z0-9]{8}$/);
  });
});

describe('emitCustomEvent', () => {
  test('dispatches a CustomEvent on document with the id', () => {
    const handler = vi.fn();
    document.addEventListener('my-event', handler);
    emitCustomEvent('my-event', 'abc');
    document.removeEventListener('my-event', handler);
    expect(handler).toHaveBeenCalledTimes(1);
    const evt = handler.mock.calls[0][0] as CustomEvent;
    expect(evt.detail).toEqual({ id: 'abc' });
    expect(evt.bubbles).toBe(true);
  });
});
