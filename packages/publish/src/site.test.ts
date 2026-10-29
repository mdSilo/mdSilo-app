import { describe, expect, test } from 'vitest';
import { buildSite, publishedNotes } from './site';
import { relHref, slug } from './paths';
import { DEFAULT_OPTIONS, type PublishOptions, type SiteFile, type SiteInput, type SiteIssue, type SiteNote } from './types';

const note = (path: string, content: string, title = path.split('/').pop()!.replace(/\.md$/, '')): SiteNote => ({
  path,
  title,
  content,
  created: '2026-10-01T00:00:00Z',
  updated: '2026-10-02T00:00:00Z',
});

const input = (notes: SiteNote[], options: Partial<PublishOptions> = {}, rest: Partial<SiteInput> = {}): SiteInput => ({
  notes,
  books: [],
  issues: [],
  milestones: [],
  projects: [],
  options: { ...DEFAULT_OPTIONS, folders: ['writing/Blog'], ...options },
  ...rest,
});

const issue = (number: number, partial: Partial<SiteIssue> = {}): SiteIssue => ({
  number,
  title: `Issue ${number}`,
  body: '',
  state: 'open',
  labels: [],
  subtasks: [],
  notes: [],
  timeline: [],
  createdAt: '2026-10-03T00:00:00Z',
  updatedAt: '2026-10-03T00:00:00Z',
  ...partial,
});

const text = (files: SiteFile[], path: string) => {
  const file = files.find((f) => f.path === path);
  if (!file || !('text' in file)) throw new Error(`no ${path}: ${files.map((f) => f.path).join(', ')}`);
  return file.text;
};

describe('paths', () => {
  test('slugs keep letters of any script', () => {
    expect(slug(' My note: a/b? ')).toBe('My-note-a/b');
    expect(slug('读书 笔记')).toBe('读书-笔记');
    expect(slug('???')).toBe('untitled');
  });

  test('hrefs are relative', () => {
    expect(relHref('notes/a/b.html', 'notes/c.html')).toBe('../c.html');
    expect(relHref('index.html', 'notes/读书.html')).toBe('notes/%E8%AF%BB%E4%B9%A6.html');
    expect(relHref('notes/a.html', 'notes/a.html')).toBe('a.html');
  });
});

describe('the notes published', () => {
  test('in the folders ticked, as their front matter says', () => {
    const notes = [
      note('writing/Blog/A.md', 'a'),
      note('writing/Blog/Draft.md', '---\npublish: false\n---\nnot yet'),
      note('writing/Private/B.md', 'b'),
      note('writing/Private/C.md', '---\npublish: true\n---\nc'),
      note('writing/Blogger/D.md', 'd'),
      note('.mdsilo/x.md', '---\npublish: true\n---'),
    ];
    const paths = publishedNotes(notes, input([]).options, new Set()).map((n) => n.path);
    expect(paths).toEqual(['writing/Blog/A.md', 'writing/Private/C.md']);
  });

  test('nothing ticked, nothing published', () => {
    expect(publishedNotes([note('writing/A.md', 'a')], DEFAULT_OPTIONS, new Set())).toEqual([]);
  });
});

describe('the site', () => {
  const notes = [
    note('writing/Blog/Hello World.md', '---\ntitle: x\n---\n# Intro\n\nSee [[Second]], [[Secret]] and [web](https://example.com). #idea#\n\n![pic](assets/p.png) ![far](https://e.com/x.png) ![no](/etc/passwd)\n\n<!-- mdsilo:note {"cfi":"x"} -->'),
    note('writing/Blog/Second.md', 'Back to [hello](Hello%20World), [also](./Hello%20World.md) and [@1](issue:1) and [b](book:Alice)'),
    note('writing/Secret.md', 'private [[Hello World]]'),
  ];

  test('notes with their links: published ones linked, others as text', async () => {
    const files = await buildSite(input(notes));
    const hello = text(files, 'notes/Blog/Hello-World.html');
    // the note's own title first, else its name
    expect(hello).toMatch(/<article><h1>Intro<\/h1><p class="meta">Updated 2026-10-02<\/p>/);
    expect(hello).not.toContain('<h1>Hello World</h1>');
    expect(text(files, 'notes/Blog/Second.html')).toContain('<article><h1>Second</h1><p class="meta">');
    expect(hello).toContain('<a href="Second.html">Second</a>');
    expect(hello).not.toContain('Secret.html');
    expect(hello).toContain('Secret'); // the text stays
    expect(hello).toContain('<a href="https://example.com">web</a>');
    expect(hello).not.toContain('mdsilo:note');
    expect(hello).not.toContain('<!--');
    expect(hello).not.toContain('title: x');
    // tags off: a plain tag
    expect(hello).toContain('<span class="hashtag">idea</span>');
    // the issue and the book are not published
    const second = text(files, 'notes/Blog/Second.html');
    expect(second).toContain('<a href="Hello-World.html">hello</a>');
    expect(second).toContain('<a href="Hello-World.html">also</a>');
    expect(second).not.toContain('issue:');
    expect(second).not.toContain('book:');
    expect(files.some((f) => f.path.includes('Secret'))).toBe(false);
  });

  test('images of the workspace copied, external kept, others dropped', async () => {
    const files = await buildSite(input(notes));
    const hello = text(files, 'notes/Blog/Hello-World.html');
    expect(files).toContainEqual({ path: 'files/writing/Blog/assets/p.png', copy: 'writing/Blog/assets/p.png' });
    expect(hello).toContain('src="../../files/writing/Blog/assets/p.png"');
    expect(hello).toContain('src="https://e.com/x.png"');
    expect(hello).not.toContain('passwd');
  });

  test('backlinks from the published notes only', async () => {
    const files = await buildSite(input(notes));
    const hello = text(files, 'notes/Blog/Hello-World.html');
    expect(hello).toMatch(/Linked from<\/h2><ul class="pages"><li><a href="Second.html">Second<\/a><\/li><\/ul>/);
    expect(text(files, 'notes/Blog/Second.html')).toContain('Linked from');
    const off = await buildSite(input(notes, { backlinks: false }));
    expect(text(off, 'notes/Blog/Hello-World.html')).not.toContain('Linked from');
  });

  test('the home, the graph and the search', async () => {
    const files = await buildSite(input(notes, { title: 'My <Notes>' }));
    const home = text(files, 'index.html');
    expect(home).toContain('<title>My &lt;Notes&gt;</title>');
    expect(home).toContain('<a href="notes/Blog/Hello-World.html">Hello World</a>');
    expect(home).toContain('<a href="graph.html">Graph</a>');
    const graph = JSON.parse(text(files, 'assets/graph-data.js').replace(/^window.MDSILO_GRAPH=|;\n$/g, ''));
    expect(graph.nodes.map((n: { t: string }) => n.t)).toEqual(['Hello World', 'Second']);
    expect(graph.links).toEqual([[0, 1], [1, 0]]);
    expect(text(files, 'notes/Blog/Second.html')).toContain('src="../../assets/style.css"'.replace('src', 'href'));
    expect(text(files, 'graph.html')).toContain('<script src="assets/graph.js"></script>');
    expect(text(files, 'assets/search-data.js')).toContain('"t":"Second"');
    expect(text(files, 'assets/search-data.js')).not.toContain('private');
    expect(files.some((f) => f.path === '.nojekyll')).toBe(true);
    expect((await buildSite(input(notes, { graph: false }))).some((f) => f.path === 'graph.html')).toBe(false);
  });

  test('tags, books, issues and journals, when ticked', async () => {
    const all = [
      ...notes,
      note('writing/Blog/2026-10-29.md', 'today #idea#'),
      note('reading/Alice.epub.md', '# Alice\n\n> a quote\n\n[x](book:0123456789abcdef0123456789abcdef#epubcfi(/6/2))'),
    ];
    const rest: Partial<SiteInput> = {
      books: [
        { id: '0123456789abcdef0123456789abcdef', title: 'Alice', author: 'Carroll', annotations: 'reading/Alice.epub.md' },
        { id: 'ffffffffffffffffffffffffffffffff', title: 'Unread' },
      ],
      issues: [
        issue(1, {
          title: 'Read <more>', body: 'about [[Second]]', labels: [{ name: 'reading', color: '#0e8a16' }],
          timeline: [{ kind: 'comment', body: 'done with [[Secret]]', createdAt: '2026-10-04T00:00:00Z' }],
        }),
      ],
    };
    const files = await buildSite(input(all, { tags: true, books: true, issues: true, journals: true }, rest));
    const second = text(files, 'notes/Blog/Second.html');
    expect(second).toContain('<a href="../../issues/1.html">@1</a>');
    expect(second).toContain('<a href="../../books/Alice.html">b</a>');
    const book = text(files, 'books/Alice.html');
    expect(book).toContain('<p class="meta">Carroll</p>');
    expect(book).toContain('<a href="Alice.html">x</a>');
    expect(files.some((f) => f.path.includes('Unread'))).toBe(false);
    // the annotations are no note page
    expect(files.some((f) => f.path.startsWith('notes/') && f.path.includes('Alice'))).toBe(false);
    const issuePage = text(files, 'issues/1.html');
    expect(issuePage).toContain('Read &lt;more&gt;');
    expect(issuePage).toContain('<a href="../notes/Blog/Second.html">Second</a>');
    expect(issuePage).toContain('done with Secret');
    expect(text(files, 'issues/index.html')).toContain('<span class="state open">Open</span>');
    expect(text(files, 'notes/Blog/Hello-World.html')).toContain('<a href="../../tags/idea.html" class="tag">idea</a>');
    expect(text(files, 'tags/idea.html')).toContain('2026-10-29');
    expect(text(files, 'tags/index.html')).toContain('#idea</a> 2');
    expect(text(files, 'index.html')).toMatch(/Journals<\/h2><ul class="pages"><li><a href="notes\/Blog\/2026-10-29.html">/);
    expect(text(files, 'notes/Blog/Hello-World.html')).toContain('<a href="../../issues/index.html">Issues</a>');
  });

  test('comments left out, but not in code', async () => {
    const md = 'a <!-- secret --> b `<!-- shown -->`\n\n<!--\nprivate\n-->\n\n```\n<!-- code -->\n```';
    const html = text(await buildSite(input([note('writing/Blog/C.md', md)])), 'notes/Blog/C.html');
    expect(html).not.toContain('secret');
    expect(html).not.toContain('private');
    expect(html).toContain('<code>&lt;!-- shown --&gt;</code>');
    expect(html).toContain('&lt;!-- code --&gt;');
  });

  test('paths stay apart', async () => {
    const files = await buildSite(input([note('writing/Blog/a b.md', ''), note('writing/Blog/a-b.md', ''), note('writing/Blog/index.md', '')]));
    const pages = files.map((f) => f.path).filter((p) => p.startsWith('notes/'));
    expect(pages.sort()).toEqual(['notes/Blog/a-b-2.html', 'notes/Blog/a-b.html', 'notes/Blog/index.html']);
  });
});

describe('math and diagrams', () => {
  const page = (content: string) => [note('writing/Blog/M.md', content)];

  test('math as MathML, chemistry too; as text when off', async () => {
    const md = 'Inline $x^2$ and \\\\(a+b\\\\) (as the editor writes it).\n\n$$\n\\sqrt{\\pi}\n$$\n\nWater: $\\ce{H2O}$';
    const html = text(await buildSite(input(page(md))), 'notes/Blog/M.html');
    expect(html.match(/<math/g)?.length).toBe(4);
    expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
    expect(html).toContain('<msqrt>');
    expect(html).not.toContain('$x^2$');
    const off = text(await buildSite(input(page(md), { math: false })), 'notes/Blog/M.html');
    expect(off).not.toContain('<math');
    expect(off).toContain('$x^2$');
  });

  test('mermaid and echarts drawn by the renderers; their code when off, without one, or failing', async () => {
    const md = '```mermaid\ngraph TD; A-->B\n```\n\n```echarts\n{"series":[]}\n```\n\n```js\nlet a = 1\n```';
    const renderers = {
      mermaid: async (code: string) => `<svg data-code="${code.trim()}"></svg>`,
      echarts: async () => { throw new Error('bad'); },
    };
    const html = text(await buildSite(input(page(md)), renderers), 'notes/Blog/M.html');
    expect(html).toContain('<figure class="diagram mermaid"><svg data-code="graph TD; A-->B"></svg></figure>');
    expect(html).toContain('<pre><code class="language-echarts">{&quot;series&quot;:[]}');
    expect(html).toContain('<code class="language-js">');
    expect(html).not.toContain('mdsilo-diagram');
    const off = text(await buildSite(input(page(md), { mermaid: false }), renderers), 'notes/Blog/M.html');
    expect(off).not.toContain('<svg');
    expect(off).toContain('language-mermaid');
    const none = text(await buildSite(input(page(md))), 'notes/Blog/M.html');
    expect(none).toContain('language-mermaid');
  });
});

describe('the issues', () => {
  const notes = [note('writing/Blog/Plan.md', 'see [@1](issue:1)'), note('writing/Private.md', 'x')];
  const rest: Partial<SiteInput> = {
    milestones: [
      { id: 'm1', title: 'Autumn', state: 'open', dueOn: '2026-11-30', description: 'reading season' },
      { id: 'm2', title: 'Empty', state: 'open' },
    ],
    issues: [
      issue(1, {
        title: 'Read more',
        body: 'body with ```mermaid``` and [[Plan]]',
        labels: [{ name: 'public', color: '#fbca04' }, { name: 'reading', color: '#0e8a16' }],
        milestone: 'm1',
        dueOn: '2020-01-01',
        subtasks: [{ text: 'chapter 1', done: true }, { text: 'chapter <2>', done: false }],
        notes: ['writing/Blog/Plan.md', 'writing/Private.md'],
        task: { note: 'writing/Private.md', text: 'read more' },
        timeline: [
          { kind: 'event', event: 'opened', createdAt: '2026-10-01T00:00:00Z' },
          { kind: 'event', event: 'labeled', detail: 'public', createdAt: '2026-10-02T00:00:00Z' },
          { kind: 'comment', body: 'a **comment**', createdAt: '2026-10-03T00:00:00Z' },
          { kind: 'event', event: 'status', detail: 'Doing', createdAt: '2026-10-04T00:00:00Z' },
        ],
      }),
      issue(2, { title: 'Done', state: 'closed', closedAt: '2026-10-05T00:00:00Z', milestone: 'm1', labels: [{ name: 'public', color: 'nope' }] }),
      issue(3, { title: 'Secret plan', labels: [{ name: 'private', color: '#000000' }] }),
    ],
    projects: [
      {
        id: 'p1', title: 'Reading list', description: 'what to read',
        statuses: [{ id: 's1', name: 'To read' }, { id: 's2', name: 'Doing', color: '#1f6feb' }],
        items: [{ issue: 2, status: 's2', order: 2 }, { issue: 1, status: 's2', order: 1 }, { issue: 3, status: 's1', order: 1 }],
      },
      { id: 'p2', title: 'Hidden', statuses: [{ id: 'x', name: 'X' }], items: [{ issue: 3, status: 'x', order: 1 }] },
    ],
  };

  test('an issue with all it has', async () => {
    const files = await buildSite(input(notes, { issues: true }, rest));
    const page = text(files, 'issues/1.html');
    expect(page).toContain('<span class="state open">Open</span> opened 2026-10-03');
    expect(page).toContain('style="background:#fbca04;color:#1f2328" href="index.html?label=public">public</a>');
    expect(page).toContain('style="background:#0e8a16;color:#ffffff"');
    expect(page).toContain('<a href="milestones.html#m-m1">Autumn</a>');
    expect(page).toContain('<span class="due" data-due="2020-01-01" data-state="open">due 2020-01-01</span>');
    expect(page).toContain('<a href="projects/Reading-list.html">Reading list</a> · Doing');
    // notes: published linked, private as its title
    expect(page).toContain('<h3>Notes</h3><a href="../notes/Blog/Plan.html">Plan</a><br>Private');
    expect(page).toContain('<h3>Task</h3>read more · in Private');
    expect(page).toContain('Subtasks <span class="num">1/2</span>');
    expect(page).toContain('chapter &lt;2&gt;');
    expect(page).toContain('added the <b>public</b> label');
    expect(page).toContain('moved this to <b>Doing</b>');
    expect(page).toMatch(/opened this issue[\s\S]*added the[\s\S]*<strong>comment<\/strong>[\s\S]*moved this to/);
    expect(page).toContain('<script src="../assets/issues.js"></script>');
    // the note links back, the graph has the explicit link
    expect(text(files, 'notes/Blog/Plan.html')).toContain('Linked from');
    expect(text(files, 'assets/graph-data.js')).toContain('"k":"issue"');
    expect(text(files, 'issues/2.html')).toContain('closed 2026-10-05');
    expect(text(files, 'issues/2.html')).toContain('background:#8b949e');
  });

  test('the list, the milestones, the boards', async () => {
    const files = await buildSite(input(notes, { issues: true }, rest));
    const list = text(files, 'issues/index.html');
    expect(list).toContain('<button type="button" data-state="open">2 Open</button><button type="button" data-state="closed">1 Closed</button>');
    expect(list).toContain('<option>public</option><option>reading</option>');
    expect(list).toContain('<option>Autumn</option>');
    expect(list).toMatch(/data-state="open" data-labels="public\nreading" data-milestone="Autumn"/);
    expect(list).toContain('1/2 subtasks · 1 comment');
    expect(list.indexOf('Secret plan')).toBeLessThan(list.indexOf('>Done<'));
    const milestones = text(files, 'issues/milestones.html');
    expect(milestones).toContain('id="m-m1"');
    expect(milestones).toContain('1/2 closed · due 2026-11-30');
    expect(milestones).not.toContain('Empty');
    const board = text(files, 'issues/projects/Reading-list.html');
    expect(board).toMatch(/To read <span class="num">1<\/span>[\s\S]*Secret plan[\s\S]*Doing <span class="num">2<\/span>[\s\S]*Read more[\s\S]*Done/);
    expect(board).toContain('style="border-top-color:#1f6feb"');
    expect(text(files, 'issues/projects.html')).toContain('Hidden');
  });

  test('only the issues with a label chosen', async () => {
    const files = await buildSite(input(notes, { issues: true, issueLabels: ['Public'] }, rest));
    expect(files.some((f) => f.path === 'issues/3.html')).toBe(false);
    expect(text(files, 'issues/index.html')).not.toContain('Secret plan');
    const board = text(files, 'issues/projects/Reading-list.html');
    expect(board).not.toContain('Secret plan');
    expect(board).toContain('To read <span class="num">0</span>');
    expect(text(files, 'issues/projects.html')).not.toContain('Hidden');
    expect(files.some((f) => f.path.includes('Hidden'))).toBe(false);
    // a link to an issue not published: text
    expect(text(files, 'issues/index.html')).toContain('2 Open'.replace('2', '1'));
  });
});
