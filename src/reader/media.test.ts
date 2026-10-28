import { CAPTION_ATTR, fillsPage, imagesOf, isDescriptive, markCaptions, mediaAt } from './media';

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

  test('an image in a link zooms, but not by a link to a note; a link in a table is followed', () => {
    const doc = docOf(`
      <a href="big.png"><img id="a" src="https://x/a.png" title="Big"></a>
      <a href="#n1" epub:type="noteref"><img id="n" src="https://x/n.png"></a>
      <a href="#n2" role="doc-noteref"><img id="r" src="https://x/r.png"></a>
      <table><tr><td id="c"><a id="l" href="other.xhtml">more</a></td></tr></table>`);
    expect(mediaAt(doc.getElementById('a'))).toEqual({ type: 'image', src: 'https://x/a.png', alt: 'Big' });
    expect(mediaAt(doc.getElementById('n'))).toBeNull();
    expect(mediaAt(doc.getElementById('r'))).toBeNull();
    expect(mediaAt(doc.getElementById('l'))).toBeNull();
    expect(mediaAt(doc.getElementById('c'))?.type).toBe('table');
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

  test('a description worth showing: not a file name or a word such as "image"', () => {
    expect(isDescriptive('A map of the island')).toBe(true);
    for (const alt of ['', 'x', 'cover', 'Image', 'fig_12.png', '12', 'untitled']) expect(isDescriptive(alt)).toBe(false);
  });

  test('captions below the images alone in their block; no node added to the book', () => {
    const doc = docOf(`
      <div class="pic" id="d"><p id="p"><img src="https://x/1.png" alt="A map of the island"/></p></div>
      <p id="inline">Text <img src="https://x/2.png" alt="An inline icon"/> more</p>
      <figure id="f"><img src="https://x/3.png" alt="Described twice"/><figcaption>Fig. 3</figcaption></figure>
      <p id="dup"><img src="https://x/4.png" alt="The harbour at night"/></p><p class="note">The harbour at night, 1880</p>
      <p id="file"><img src="https://x/5.png" alt="image5.jpg"/></p>
      <p id="svg"><svg><title>A drawn plan</title><image href="https://x/6.png"/></svg></p>
      <p id="two"><img src="https://x/7.png" alt="One of two"/><img src="https://x/8.png" alt="Two of two"/></p>`);
    const before = doc.body.innerHTML.replace(/\s+data-mdsilo-caption="[^"]*"/g, '');
    expect(markCaptions(doc)).toBe(2);
    // the outermost block of the image
    expect(doc.getElementById('d')!.getAttribute(CAPTION_ATTR)).toBe('A map of the island');
    expect(doc.getElementById('p')!.hasAttribute(CAPTION_ATTR)).toBe(false);
    expect(doc.getElementById('svg')!.getAttribute(CAPTION_ATTR)).toBe('A drawn plan');
    for (const id of ['inline', 'f', 'dup', 'file', 'two']) expect(doc.getElementById(id)!.hasAttribute(CAPTION_ATTR)).toBe(false);
    // only attributes: the nodes and the text, so the CFIs, as they were
    expect(doc.body.innerHTML.replace(/\s+data-mdsilo-caption="[^"]*"/g, '')).toBe(before);
  });
});
