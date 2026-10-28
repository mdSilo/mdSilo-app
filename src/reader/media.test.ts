import { fillsPage, imagesOf, mediaAt } from './media';

const docOf = (body: string) => new DOMParser().parseFromString(`<html><body>${body}</body></html>`, 'text/html');

describe('the images and tables of the pages', () => {
  test('under a click: an image, an svg image, a table; not a note mark', () => {
    const doc = docOf(`
      <img id="a" src="https://x/a.png" alt=" A cat ">
      <svg id="s" xmlns:xlink="http://www.w3.org/1999/xlink"><title>Map</title><image xlink:href="https://x/m.png"/><rect id="r"/></svg>
      <table id="t"><tr><td id="c">1</td></tr></table>
      <sup><img id="n" src="https://x/n.png"></sup>
      <p id="p">text</p>`);
    expect(mediaAt(doc.getElementById('a'))).toEqual({ type: 'image', src: 'https://x/a.png', alt: 'A cat' });
    expect(mediaAt(doc.getElementById('r'))).toEqual({ type: 'image', src: 'https://x/m.png', alt: 'Map' });
    expect(mediaAt(doc.getElementById('c'))).toEqual({ type: 'table', html: doc.getElementById('t')!.outerHTML });
    expect(mediaAt(doc.getElementById('n'))).toBeNull();
    expect(mediaAt(doc.getElementById('p'))).toBeNull();
    expect(mediaAt(null)).toBeNull();
  });

  test('the images of the sections, in order', () => {
    const one = docOf('<img src="https://x/1.png"><svg><image href="https://x/2.png"/></svg><img>');
    const two = docOf('<img src="https://x/3.png" alt="three">');
    expect(imagesOf([{ doc: one }, { doc: two }]).map((i) => [i.src, i.alt])).toEqual([
      ['https://x/1.png', ''], ['https://x/2.png', ''], ['https://x/3.png', 'three'],
    ]);
  });

  test('a cover fills the page; an inline figure does not', () => {
    const doc = docOf('<img id="big" src="https://x/1.png"><img id="small" src="https://x/2.png">');
    doc.documentElement.style.setProperty('--available-width', '600');
    doc.documentElement.style.setProperty('--available-height', '800');
    const sized = (id: string, width: number, height: number) => {
      const el = doc.getElementById(id)!;
      el.getBoundingClientRect = () => ({ width, height }) as DOMRect;
      return el;
    };
    expect(fillsPage(sized('big', 600, 700))).toBe(true);
    expect(fillsPage(sized('small', 300, 200))).toBe(false);
  });
});
