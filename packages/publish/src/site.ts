import { ASSETS } from './assets';
import {
  issueBody, issuesIndex, ISSUES_INDEX, milestonesPage, MILESTONES_INDEX, projectBoard, projectsIndex, PROJECTS_INDEX,
  type IssueContext, type TimelineEntry,
} from './issues';
import { escapeHtml, normalizePath, PathSet, relHref, slug } from './paths';
import { diagramMark, frontMatter, renderNote, textOf, type Features, type Rendered, type Resolver } from './render';
import type { PublishOptions, Renderers, SiteBook, SiteFile, SiteInput, SiteIssue, SiteNote } from './types';

const WRITING = 'writing/';
const DATE_TITLE = /^([0-9]{4})-(0?[1-9]|1[0-2])-(0?[1-9]|[12][0-9]|3[01])$/;
const BOOK_ID = /^[0-9a-f]{32}$/i;
/** never published, whatever links to them */
const PRIVATE_DIRS = /^(\.mdsilo|\.git)(\/|$)/;

const safeDecode = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const dirOf = (path: string) => path.split('/').slice(0, -1).join('/');

/**
 * The notes published: in a folder ticked, unless their front matter says
 * `publish: false`; or anywhere with `publish: true`. The annotations of
 * books go to the book pages instead.
 */
export function publishedNotes(notes: SiteNote[], options: PublishOptions, annotations: Set<string>): SiteNote[] {
  const folders = options.folders.map((f) => f.replace(/\/+$/, '')).filter(Boolean);
  return notes.filter((note) => {
    if (annotations.has(note.path) || PRIVATE_DIRS.test(note.path)) return false;
    const flag = frontMatter(note.content).publish?.toLowerCase();
    if (flag === 'false' || flag === 'no') return false;
    if (flag === 'true' || flag === 'yes') return true;
    return folders.some((folder) => note.path.startsWith(`${folder}/`));
  });
}

type Page = {
  path: string;
  title: string;
  kind: 'note' | 'book' | 'issue';
  /** the dir links in it are relative to */
  dir: string;
  rendered?: Rendered;
  /** for the home: notes only */
  note?: SiteNote;
  book?: SiteBook;
  issue?: SiteIssue;
  /** the comments of an issue rendered, by their place in its timeline */
  comments?: Map<number, Rendered>;
  /** the timeline of an issue, its comments rendered */
  timeline?: TimelineEntry[];
};

/** The issues published: all, or those with a label chosen. */
export function publishedIssues(issues: SiteIssue[], options: PublishOptions): SiteIssue[] {
  if (!options.issues) return [];
  const labels = new Set(options.issueLabels.map((l) => l.trim().toLowerCase()).filter(Boolean));
  return labels.size ? issues.filter((i) => i.labels.some((l) => labels.has(l.name.toLowerCase()))) : issues;
}

/** Draw the diagrams; one failing shows its code. */
async function drawDiagrams(rendered: Rendered[], renderers: Renderers) {
  for (const r of rendered) {
    for (const d of r.diagrams) {
      const draw = renderers[d.lang as keyof Renderers];
      let html = `<pre><code class="language-${escapeHtml(d.lang)}">${escapeHtml(d.code)}</code></pre>`;
      try {
        if (draw) html = `<figure class="diagram ${escapeHtml(d.lang)}">${await draw(d.code)}</figure>`;
      } catch {
        // the code, as without the option
      }
      r.html = r.html.replace(diagramMark(d.id), html);
    }
  }
}

/**
 * The files of the static site of a workspace; the mermaid and echarts code
 * blocks drawn by `renderers`, where a browser is.
 */
export async function buildSite(input: SiteInput, renderers: Renderers = {}): Promise<SiteFile[]> {
  const { options } = input;
  const paths = new PathSet();
  for (const reserved of ['index', 'graph', 'search', 'books/index', 'issues/index', 'issues/milestones', 'issues/projects', 'tags/index']) {
    paths.claim(reserved, '.html');
  }

  const books = options.books ? input.books.filter((b) => b.annotations) : [];
  const annotationPaths = new Set(input.books.map((b) => b.annotations).filter((p): p is string => !!p));
  const notes = publishedNotes(input.notes, options, annotationPaths).sort((a, b) => a.path.localeCompare(b.path));
  const notesByPath = new Map(input.notes.map((n) => [n.path, n]));

  // the pages and their paths
  const pageOfNote = new Map<string, Page>();
  for (const note of notes) {
    const rel = (note.path.startsWith(WRITING) ? note.path.slice(WRITING.length) : note.path).replace(/\.md$/i, '');
    const path = paths.claim(`notes/${rel.split('/').map(slug).join('/')}`, '.html');
    pageOfNote.set(note.path, { path, title: note.title, kind: 'note', dir: dirOf(note.path), note });
  }
  const pageOfBook = new Map<string, Page>();
  for (const book of books) {
    const path = paths.claim(`books/${slug(book.title)}`, '.html');
    pageOfBook.set(book.id, { path, title: book.title, kind: 'book', dir: dirOf(book.annotations ?? ''), book });
  }
  const issues = publishedIssues(input.issues, options);
  const pageOfIssue = new Map<number, Page>();
  for (const issue of issues) {
    const path = paths.claim(`issues/${issue.number}`, '.html');
    pageOfIssue.set(issue.number, { path, title: issue.title, kind: 'issue', dir: '', issue });
  }
  const published = new Set(issues.map((i) => i.number));
  const projects = input.projects
    .map((p) => ({ ...p, items: p.items.filter((i) => published.has(i.issue)) }))
    .filter((p) => p.items.length > 0);
  const projectPaths = new Map(projects.map((p) => [p.id, paths.claim(`issues/projects/${slug(p.title)}`, '.html')]));
  const tagPaths = new Map<string, string>();
  const tagPath = (name: string) => {
    let path = tagPaths.get(name);
    if (!path) tagPaths.set(name, (path = paths.claim(`tags/${slug(name)}`, '.html')));
    return path;
  };
  const files = new Map<string, string>();

  // what links resolve to
  const byTitle = new Map<string, SiteNote>();
  for (const note of input.notes) if (!byTitle.has(note.title)) byTitle.set(note.title, note);
  const bookOf = (ref: string) => {
    const r = safeDecode(ref).trim();
    return BOOK_ID.test(r)
      ? books.find((b) => b.id.toLowerCase() === r.toLowerCase())
      : books.find((b) => b.title.toLowerCase() === r.toLowerCase());
  };
  const noteOf = (href: string, dir: string): SiteNote | undefined => {
    const target = safeDecode(href.split('#')[0]).trim();
    if (!target) return undefined;
    if (/\.md$/i.test(target)) {
      const path = normalizePath(dir ? `${dir}/${target}` : target);
      const found = path ? notesByPath.get(path) : undefined;
      if (found) return found;
    }
    const title = target.replace(/\.md$/i, '');
    return byTitle.get(title) ?? byTitle.get(title.replace(/_/g, ' ')) ?? byTitle.get(title.split('/').pop() ?? '');
  };
  const resolverOf = (page: Page): Resolver => ({
    link: (href) => {
      const app = /^(issue|book):(.*)$/i.exec(href);
      if (app?.[1].toLowerCase() === 'issue') return pageOfIssue.get(Number(app[2]))?.path;
      if (app) {
        const book = bookOf(app[2].split('#')[0]);
        return book ? pageOfBook.get(book.id)?.path : undefined;
      }
      const note = noteOf(href, page.dir);
      return note ? pageOfNote.get(note.path)?.path : undefined;
    },
    image: (src) => {
      const target = safeDecode(src.split(/[?#]/)[0]).trim();
      if (!target || /^[a-z][\w+.-]*:/i.test(target) || target.startsWith('/')) return undefined;
      const path = normalizePath(page.dir ? `${page.dir}/${target}` : target);
      if (!path || PRIVATE_DIRS.test(path)) return undefined;
      const file = `files/${path.split('/').map(slug).join('/')}`;
      files.set(file, path);
      return file;
    },
    tag: (name) => (options.tags ? tagPath(name) : undefined),
  });
  let diagramId = 0;
  const features: Features = {
    math: options.math,
    diagrams: new Set((['mermaid', 'echarts'] as const).filter((lang) => options[lang] && renderers[lang])),
    nextId: () => (diagramId += 1),
  };
  const rendered: Rendered[] = [];
  const render = (content: string, page: Page) => {
    const r = renderNote(content, page.path, resolverOf(page), features);
    rendered.push(r);
    return r;
  };

  const pages = [...pageOfNote.values(), ...pageOfBook.values(), ...pageOfIssue.values()];
  for (const page of pages) {
    if (page.note) page.rendered = render(page.note.content, page);
    if (page.book) page.rendered = render(notesByPath.get(page.book.annotations ?? '')?.content ?? '', page);
    if (page.issue) {
      const main = (page.rendered = render(page.issue.body, page));
      const comments = new Map<number, Rendered>();
      page.issue.timeline.forEach((item, i) => {
        if (item.kind !== 'comment') return;
        const r = render(item.body, page);
        r.links.forEach((l) => main.links.add(l));
        r.tags.forEach((t) => main.tags.add(t));
        comments.set(i, r);
      });
      // the notes linked to it: links of its page too, for the graph
      for (const path of page.issue.notes) {
        const note = pageOfNote.get(path);
        if (note) main.links.add(note.path);
      }
      page.comments = comments;
    }
  }
  await drawDiagrams(rendered, renderers);
  // the comments in the timeline, drawn
  for (const page of pageOfIssue.values()) {
    page.timeline = (page.issue?.timeline ?? []).map((item, i): TimelineEntry =>
      item.kind === 'comment' ? { kind: 'comment', html: page.comments?.get(i)?.html ?? '', createdAt: item.createdAt } : item
    );
  }

  // backlinks and tags
  const backlinks = new Map<string, Page[]>();
  const tagged = new Map<string, Page[]>();
  for (const page of pages) {
    for (const target of page.rendered?.links ?? []) {
      if (target === page.path) continue;
      backlinks.set(target, [...(backlinks.get(target) ?? []), page]);
    }
    for (const tag of page.rendered?.tags ?? []) tagged.set(tag, [...(tagged.get(tag) ?? []), page]);
  }

  const site: SiteContext = { options, hasBooks: pageOfBook.size > 0, hasIssues: pageOfIssue.size > 0, hasTags: options.tags && tagged.size > 0 };
  const issueContext: IssueContext = {
    issues,
    milestones: new Map(input.milestones.map((m) => [m.id, m])),
    projects,
    issuePath: (num) => pageOfIssue.get(num)?.path,
    projectPath: (id) => projectPaths.get(id) ?? PROJECTS_INDEX,
    note: (path) => {
      const page = pageOfNote.get(path);
      return { title: notesByPath.get(path)?.title ?? path.split('/').pop()?.replace(/\.md$/i, '') ?? path, path: page?.path };
    },
  };
  const out: SiteFile[] = [];
  const emit = (path: string, title: string, body: string, wide = false) =>
    out.push({ path, text: layout(site, path, title, body, wide) });
  const linkTo = (from: string, page: Page) => `<a href="${relHref(from, page.path)}">${escapeHtml(page.title)}</a>`;
  const listOf = (from: string, list: Page[]) =>
    `<ul class="pages">${list.map((p) => `<li>${linkTo(from, p)}</li>`).join('')}</ul>`;
  const backlinksOf = (page: Page) => {
    const from = options.backlinks ? (backlinks.get(page.path) ?? []) : [];
    return from.length ? `<section class="backlinks"><h2>Linked from</h2>${listOf(page.path, from)}</section>` : '';
  };

  for (const page of pageOfNote.values()) {
    const note = page.note as SiteNote;
    const meta = `<p class="meta">Updated ${escapeHtml(dateOf(note.updated))}</p>`;
    emit(page.path, page.title, `<article>${withTitle(page.title, meta, page.rendered?.html ?? '')}</article>${backlinksOf(page)}`);
  }
  for (const page of pageOfBook.values()) {
    const book = page.book as SiteBook;
    const by = book.author ? `<p class="meta">${escapeHtml(book.author)}</p>` : '';
    emit(page.path, page.title, `<article class="book"><h1>${escapeHtml(book.title)}</h1>${by}${page.rendered?.html ?? ''}</article>${backlinksOf(page)}`);
  }
  if (site.hasBooks) {
    const list = [...pageOfBook.values()].sort((a, b) => a.title.localeCompare(b.title));
    emit('books/index.html', 'Books', `<h1>Books</h1>${listOf('books/index.html', list)}`);
  }
  for (const page of pageOfIssue.values()) {
    const issue = page.issue as SiteIssue;
    const head = `<h1>${escapeHtml(issue.title)} <span class="num">@${issue.number}</span></h1>`;
    const body = issueBody(page.path, issue, page.rendered?.html ?? '', page.timeline ?? [], issueContext);
    emit(page.path, page.title, `<article class="issue-page">${head}${body}</article>${backlinksOf(page)}`);
  }
  if (site.hasIssues) {
    emit(ISSUES_INDEX, 'Issues', issuesIndex(issueContext));
    if (issues.some((i) => i.milestone && issueContext.milestones.has(i.milestone))) {
      emit(MILESTONES_INDEX, 'Milestones', milestonesPage(issueContext));
    }
    if (projects.length) {
      emit(PROJECTS_INDEX, 'Projects', projectsIndex(issueContext));
      for (const project of projects) {
        const path = issueContext.projectPath(project.id);
        emit(path, project.title, projectBoard(path, project, issueContext), true);
      }
    }
  }
  if (site.hasTags) {
    const names = [...tagged.keys()].sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      const path = tagPath(name);
      emit(path, `#${name}`, `<h1>#${escapeHtml(name)}</h1>${listOf(path, tagged.get(name) ?? [])}`);
    }
    const items = names.map((n) => `<li><a class="tag" href="${relHref('tags/index.html', tagPath(n))}">#${escapeHtml(n)}</a> ${tagged.get(n)?.length}</li>`);
    emit('tags/index.html', 'Tags', `<h1>Tags</h1><ul class="tags">${items.join('')}</ul>`);
  }

  // home: journals, recent, all notes by folder
  const notePages = [...pageOfNote.values()];
  const journals = options.journals
    ? notePages.filter((p) => DATE_TITLE.test(p.title)).sort((a, b) => b.title.localeCompare(a.title))
    : [];
  // a few notes: all of them are listed below already
  const recent = notePages.length > 10
    ? [...notePages].sort((a, b) => (b.note?.updated ?? '').localeCompare(a.note?.updated ?? '')).slice(0, 10)
    : [];
  const folders = new Map<string, Page[]>();
  for (const page of notePages) {
    const dir = dirOf(page.note?.path ?? '').replace(/^writing\/?/, '');
    folders.set(dir, [...(folders.get(dir) ?? []), page]);
  }
  const byFolder = [...folders.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, list]) => `${dir ? `<h3>${escapeHtml(dir)}</h3>` : ''}${listOf('index.html', list)}`)
    .join('');
  const home = [
    `<h1>${escapeHtml(options.title)}</h1>`,
    journals.length ? `<section><h2>Journals</h2>${listOf('index.html', journals.slice(0, 30))}</section>` : '',
    recent.length ? `<section><h2>Recent</h2>${listOf('index.html', recent)}</section>` : '',
    notePages.length ? `<section><h2>All notes</h2>${byFolder}</section>` : '<p>Nothing published yet.</p>',
  ].join('');
  emit('index.html', options.title, home);

  // graph and search
  if (options.graph) {
    const ids = new Map(pages.map((p, i) => [p.path, i]));
    const links: [number, number][] = [];
    for (const page of pages) {
      for (const target of page.rendered?.links ?? []) {
        const [a, b] = [ids.get(page.path), ids.get(target)];
        if (a !== undefined && b !== undefined && a !== b) links.push([a, b]);
      }
    }
    const nodes = pages.map((p) => ({ t: p.title, u: p.path, k: p.kind }));
    out.push({ path: 'assets/graph-data.js', text: `window.MDSILO_GRAPH=${JSON.stringify({ nodes, links })};\n` });
    emit('graph.html', 'Graph', '<h1>Graph</h1><canvas id="graph"></canvas><p class="meta">Drag to move, scroll to zoom, click a node to open it.</p><script src="assets/graph-data.js"></script><script src="assets/graph.js"></script>');
  }
  const textOfPage = (p: Page) =>
    [p.rendered?.html ?? '', ...(p.timeline ?? []).map((t) => (t.kind === 'comment' ? t.html : ''))].map(textOf).join(' ');
  const index = pages.map((p) => ({ t: p.title, u: p.path, x: textOfPage(p).slice(0, 5000) }));
  out.push({ path: 'assets/search-data.js', text: `window.MDSILO_SEARCH=${JSON.stringify(index)};\n` });
  emit('search.html', 'Search', '<h1>Search</h1><ul id="results" class="pages"></ul><script src="assets/search-data.js"></script><script src="assets/search.js"></script>');

  for (const [path, text] of Object.entries(ASSETS)) out.push({ path: `assets/${path}`, text });
  // GitHub Pages: serve the files as they are
  out.push({ path: '.nojekyll', text: '' });
  for (const [path, copy] of files) out.push({ path, copy });
  return out;
}

const dateOf = (iso: string) => iso.slice(0, 10);

/** The title on top, the note's own if it starts with one, then the meta. */
function withTitle(title: string, meta: string, html: string) {
  const own = /^<h1>.*?<\/h1>/.exec(html);
  return own ? `${own[0]}${meta}${html.slice(own[0].length)}` : `<h1>${escapeHtml(title)}</h1>${meta}${html}`;
}

type SiteContext = { options: PublishOptions; hasBooks: boolean; hasIssues: boolean; hasTags: boolean };

function layout(site: SiteContext, path: string, title: string, body: string, wide: boolean) {
  const href = (to: string) => relHref(path, to);
  const nav = [
    ['index.html', 'Home'],
    site.options.graph ? ['graph.html', 'Graph'] : undefined,
    site.hasTags ? ['tags/index.html', 'Tags'] : undefined,
    site.hasBooks ? ['books/index.html', 'Books'] : undefined,
    site.hasIssues ? ['issues/index.html', 'Issues'] : undefined,
  ]
    .filter((item): item is string[] => !!item)
    .map(([to, name]) => `<a href="${href(to)}">${name}</a>`)
    .join('');
  const name = escapeHtml(site.options.title);
  const pageTitle = path === 'index.html' ? name : `${escapeHtml(title)} · ${name}`;
  // the scripts of a page are linked from the root: base them there
  const fixed = body.replace(/src="assets\//g, `src="${href('assets/')}`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="mdSilo">
<title>${pageTitle}</title>
<link rel="stylesheet" href="${href('assets/style.css')}">
</head>
<body data-root="${href('index.html').replace(/index\.html$/, '')}">
<header><a class="site" href="${href('index.html')}">${name}</a><nav>${nav}</nav>
<form class="search" action="${href('search.html')}"><input name="q" type="search" placeholder="Search" aria-label="Search"></form></header>
<main${wide ? ' class="wide"' : ''}>${fixed}</main>
<footer>Published with <a href="https://github.com/mdSilo/mdSilo-app">mdSilo</a></footer>
</body>
</html>
`;
}
