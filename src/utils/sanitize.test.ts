import { describe, expect, test } from 'vitest';
import { sanitizeHtml } from './sanitize';

const parse = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
};

describe('sanitizeHtml', () => {
  test('keeps the content: text, formatting, images, media, tables', () => {
    const html =
      '<h2>Title</h2><p>Some <b>bold</b> and <em>em</em> text</p>' +
      '<img src="https://x.y/a.png" alt="pic"><video src="https://x.y/v.mp4" controls></video>' +
      '<table><tr><td>cell</td></tr></table><pre><code>code</code></pre>';
    const out = parse(sanitizeHtml(html));
    expect(out.querySelector('h2')?.textContent).toBe('Title');
    expect(out.querySelector('b')?.textContent).toBe('bold');
    expect(out.querySelector('img')).toHaveAttribute('src', 'https://x.y/a.png');
    expect(out.querySelector('video')).toHaveAttribute('src', 'https://x.y/v.mp4');
    expect(out.querySelector('td')?.textContent).toBe('cell');
    expect(out.querySelector('code')?.textContent).toBe('code');
  });

  test('removes scripts, event handlers and javascript: urls', () => {
    const out = parse(sanitizeHtml(
      '<script>alert(1)</script><img src="x" onerror="alert(1)">' +
      '<a href="javascript:alert(1)">js</a><iframe src="https://evil"></iframe>' +
      '<svg><script>alert(1)</script><a href="javascript:alert(1)"><text>s</text></a></svg>'
    ));
    expect(out.querySelector('script, iframe')).toBeNull();
    expect(out.querySelector('img')).not.toHaveAttribute('onerror');
    expect(out.innerHTML).not.toMatch(/javascript:|alert/);
  });

  test('removes what could restyle, cover or pose as the app', () => {
    const out = parse(sanitizeHtml(
      '<style>body { display: none }</style>' +
      '<div id="app-container" class="fixed inset-0 modal-open" style="position: fixed">x</div>' +
      '<form action="https://evil"><input name="password"><button>Log in</button><textarea></textarea></form>'
    ));
    expect(out.querySelector('style, form, input, button, textarea')).toBeNull();
    const div = out.querySelector('div') as HTMLElement;
    expect(div).not.toHaveAttribute('id');
    expect(div).not.toHaveAttribute('class');
    expect(div).not.toHaveAttribute('style');
  });

  test('opens links outside the app', () => {
    const out = parse(sanitizeHtml(
      '<a href="https://x.y">a</a><a href="https://x.y" target="_self" rel="opener">b</a><a name="anchor">c</a>'
    ));
    const [a, b, c] = Array.from(out.querySelectorAll('a'));
    for (const link of [a, b]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    // not a link
    expect(c).not.toHaveAttribute('target');
  });
});
