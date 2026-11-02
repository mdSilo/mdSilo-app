import {
  bookExtOf,
  bookFileName,
  parseCatalog,
  parseOpenSearch,
  searchUrl,
} from "./opds";

const BASE = "https://books.example.org/opds/";

const NAVIGATION = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:root</id>
  <title>Example Library</title>
  <subtitle>Free books</subtitle>
  <link rel="search" type="application/opensearchdescription+xml" href="search.xml"/>
  <link rel="next" type="application/atom+xml;profile=opds-catalog" href="?page=2"/>
  <entry>
    <id>urn:new</id>
    <title>New books</title>
    <content type="text">The latest</content>
    <link rel="subsection" type="application/atom+xml;profile=opds-catalog;kind=acquisition" href="new"/>
  </entry>
</feed>`;

const ACQUISITION = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/">
  <id>urn:new</id>
  <title>New books</title>
  <link rel="search" type="application/atom+xml" href="/search?q={searchTerms}"/>
  <entry>
    <id>urn:book:1</id>
    <title>Pride and Prejudice</title>
    <author><name>Jane Austen</name></author>
    <dc:language>en</dc:language>
    <dc:issued>1813</dc:issued>
    <category term="fiction" label="Fiction"/>
    <summary type="html">&lt;p&gt;A novel&lt;/p&gt;</summary>
    <link rel="http://opds-spec.org/image/thumbnail" type="image/jpeg" href="/covers/1-small.jpg"/>
    <link rel="http://opds-spec.org/image" type="image/jpeg" href="/covers/1.jpg"/>
    <link rel="http://opds-spec.org/acquisition/open-access" type="application/epub+zip" href="/books/1.epub" title="EPUB"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="/books/1.epub"/>
    <link rel="http://opds-spec.org/acquisition" type="application/pdf" href="/books/1.pdf"/>
    <link rel="http://opds-spec.org/acquisition" type="application/x-unknown" href="/books/1.xyz"/>
    <link rel="alternate" type="application/atom+xml;type=entry;profile=opds-catalog" href="/entry/1"/>
  </entry>
  <entry>
    <id>urn:book:2</id>
    <title>For sale</title>
    <link rel="http://opds-spec.org/acquisition/buy" type="text/html" href="https://shop.example.org/2"/>
  </entry>
</feed>`;

const OPDS2 = JSON.stringify({
  metadata: { title: "JSON Library" },
  links: [
    { rel: "self", href: "/opds2", type: "application/opds+json" },
    {
      rel: "search",
      href: "/search{?query}",
      type: "application/opds+json",
      templated: true,
    },
  ],
  navigation: [
    { href: "popular", title: "Popular", type: "application/opds+json" },
  ],
  groups: [
    {
      metadata: { title: "Featured" },
      publications: [
        {
          metadata: {
            title: "Moby Dick",
            identifier: "urn:isbn:1",
            author: [{ name: "Herman Melville" }],
            language: "en",
            description: "A whale",
            subject: [{ name: "Sea" }],
          },
          links: [
            {
              rel: "http://opds-spec.org/acquisition/open-access",
              href: "/books/moby.epub",
              type: "application/epub+zip",
            },
          ],
          images: [
            { href: "/covers/moby-big.jpg", width: 600 },
            { href: "/covers/moby-small.jpg", width: 100 },
          ],
        },
      ],
    },
  ],
});

describe("parseCatalog: OPDS 1", () => {
  test("a navigation feed: its entries are pages, its search and next page", () => {
    const feed = parseCatalog(NAVIGATION, BASE)!;
    expect(feed.title).toBe("Example Library");
    expect(feed.subtitle).toBe("Free books");
    expect(feed.next).toBe(`${BASE}?page=2`);
    expect(feed.search).toEqual({ description: `${BASE}search.xml` });
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0].nav?.href).toBe(`${BASE}new`);
    expect(feed.entries[0].summary).toBe("The latest");
  });

  test("an acquisition feed: the books, their formats and covers", () => {
    const feed = parseCatalog(ACQUISITION, BASE)!;
    expect(feed.search).toEqual({
      template: "https://books.example.org/search?q={searchTerms}",
    });
    const [book, forSale] = feed.entries;
    expect(book.id).toBe("urn:book:1");
    expect(book.nav).toBeUndefined();
    expect(book.authors).toEqual(["Jane Austen"]);
    expect(book.language).toBe("en");
    expect(book.published).toBe("1813");
    expect(book.subjects).toEqual(["Fiction"]);
    expect(book.summary).toBe("<p>A novel</p>");
    expect(book.thumbnail).toBe("https://books.example.org/covers/1-small.jpg");
    // the same file once; a format not read left out
    expect(book.acquisitions.map((a) => [a.ext, a.href])).toEqual([
      ["epub", "https://books.example.org/books/1.epub"],
      ["pdf", "https://books.example.org/books/1.pdf"],
    ]);
    expect(forSale.acquisitions).toEqual([]);
    expect(forSale.external.map((l) => l.href)).toEqual([
      "https://shop.example.org/2",
    ]);
  });

  test("not a catalog", () => {
    expect(parseCatalog("<html><body/></html>", BASE)).toBeNull();
    expect(parseCatalog("not xml <", BASE)).toBeNull();
  });
});

describe("parseCatalog: OPDS 2", () => {
  test("navigation, groups, publications and a templated search", () => {
    const feed = parseCatalog(OPDS2, BASE)!;
    expect(feed.title).toBe("JSON Library");
    expect(feed.search).toEqual({
      template: "https://books.example.org/search{?query}",
    });
    const [nav, book] = feed.entries;
    expect(nav.nav?.href).toBe(`${BASE}popular`);
    expect(nav.title).toBe("Popular");
    expect(book.group).toBe("Featured");
    expect(book.id).toBe("urn:isbn:1");
    expect(book.title).toBe("Moby Dick");
    expect(book.authors).toEqual(["Herman Melville"]);
    expect(book.subjects).toEqual(["Sea"]);
    expect(book.thumbnail).toBe(
      "https://books.example.org/covers/moby-small.jpg",
    );
    expect(book.acquisitions.map((a) => a.href)).toEqual([
      "https://books.example.org/books/moby.epub",
    ]);
  });

  test("not a catalog", () => {
    expect(parseCatalog("{}", BASE)).toBeNull();
    expect(parseCatalog("{not json", BASE)).toBeNull();
  });
});

describe("search", () => {
  test("the template of an OpenSearch description: of Atom results", () => {
    const xml = `<?xml version="1.0"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <Url type="text/html" template="/html?q={searchTerms}"/>
  <Url type="application/atom+xml;profile=opds-catalog" template="/opds/search?q={searchTerms}&amp;p={startPage?}"/>
</OpenSearchDescription>`;
    expect(parseOpenSearch(xml, `${BASE}search.xml`)).toBe(
      "https://books.example.org/opds/search?q={searchTerms}&p={startPage?}",
    );
  });

  test("the URL of a search: OpenSearch or URI template", () => {
    expect(
      searchUrl(
        "https://x.org/s?q={searchTerms}&p={startPage?}",
        "jane austen",
      ),
    ).toBe("https://x.org/s?q=jane%20austen&p=");
    expect(searchUrl("https://books.example.org/search{?query}", "a&b")).toBe(
      "https://books.example.org/search?query=a%26b",
    );
    expect(
      searchUrl("https://books.example.org/search{?title,author}", "x"),
    ).toBe("https://books.example.org/search");
  });
});

test("bookExtOf: the formats the reader opens", () => {
  expect(bookExtOf("application/epub+zip")).toBe("epub");
  expect(bookExtOf("application/pdf; charset=binary")).toBe("pdf");
  expect(bookExtOf("text/html")).toBeUndefined();
});

test("bookFileName: no characters not allowed in file names", () => {
  expect(bookFileName({ title: 'A/B: "C"?' }, "epub")).toBe("A B C.epub");
  expect(bookFileName({ title: "..." }, "pdf")).toBe("book.pdf");
});
