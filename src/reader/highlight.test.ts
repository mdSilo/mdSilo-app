import { highlightCode } from './highlight';

describe('highlighting code', () => {
  test('colors a block, in the language set; put back as it was when off', () => {
    const doc = new DOMParser().parseFromString('<pre><code>const x = 1; // one</code></pre><pre>plain</pre>', 'text/html');
    const code = doc.querySelector('code')!;
    const original = code.innerHTML;
    highlightCode(doc, true, 'javascript');
    expect(code.classList.contains('hljs')).toBe(true);
    expect(code.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(code.textContent).toBe('const x = 1; // one');
    // again, in another language: from the text of the book, not the colored one
    highlightCode(doc, true, 'python');
    expect(code.textContent).toBe('const x = 1; // one');
    highlightCode(doc, false);
    expect(code.innerHTML).toBe(original);
    expect(code.classList.contains('hljs')).toBe(false);
    expect(doc.querySelectorAll('pre')[1]!.innerHTML).toBe('plain');
  });
});
