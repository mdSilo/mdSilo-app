/* Books for unit tests. Not imported by app code. */
import { createZip } from '@/host/web/zip';

const text = (s: string) => new TextEncoder().encode(s);

/** A small EPUB 3: two chapters and a navigation document. */
export function makeEpub(title = 'Tiny Book'): File {
  const chapter = (n: number, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${n}</title></head>
<body><h1>Chapter ${n}</h1><p>${body}</p></body></html>`;
  const zip = createZip([
    { name: 'mimetype', data: text('application/epub+zip') },
    {
      name: 'META-INF/container.xml',
      data: text(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    },
    {
      name: 'OEBPS/content.opf',
      data: text(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">urn:uuid:tiny</dc:identifier>
<dc:title>${title}</dc:title><dc:creator>Jane Doe</dc:creator><dc:language>en</dc:language>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>`),
    },
    {
      name: 'OEBPS/nav.xhtml',
      data: text(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head>
<body><nav epub:type="toc"><ol>
<li><a href="c1.xhtml">Chapter One</a></li><li><a href="c2.xhtml">Chapter Two</a></li>
</ol></nav></body></html>`),
    },
    { name: 'OEBPS/c1.xhtml', data: text(chapter(1, 'It was a bright cold day in April.')) },
    { name: 'OEBPS/c2.xhtml', data: text(chapter(2, 'The clocks were striking thirteen.')) },
  ]);
  return new File([zip], `${title}.epub`, { type: 'application/epub+zip' });
}
