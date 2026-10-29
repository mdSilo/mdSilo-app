/**
 * The demo workspace of the first run: the manual (`docs/manual`) as notes, a
 * book to try the Reader and links with, and a few issues on a project board.
 * Files in the shape the app writes, see src/workspace/layout.ts.
 */
import { partialMd5 } from '@/lib/partialMd5';
import type { FileData } from './fs';

export type DemoFile = { path: string; data: FileData };

const manuals = {
  en: import.meta.glob('../../../docs/manual/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>,
  zh: import.meta.glob('../../../docs/manual-zh/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>,
};

export type DemoLang = 'en' | 'zh';

/** The language of the manual: Chinese for a Chinese browser, else English. */
export const demoLangOf = (language = globalThis.navigator?.language ?? 'en'): DemoLang =>
  language.toLowerCase().startsWith('zh') ? 'zh' : 'en';

/**
 * What the first run adds, in the workspace: to remove it again, see
 * demoClear.ts. In the local data, never synced.
 */
export const DEMO_MARKER = '.mdsilo/local/demo.json';
export type DemoMarker = {
  version: 1;
  /** the folder of the manual in writing/ */
  notes: string;
  /** the book: its id and files, relative to the workspace */
  book?: { hash: string; files: string[] };
  /** the numbers of the issues */
  issues: number[];
  labels: string[];
  milestones: string[];
  projects: string[];
};

const TEXT = {
  en: {
    notes: 'Manual',
    status: 'Doing',
    labels: { question: 'question', idea: 'idea', reading: 'reading' },
    milestone: ['Week 1', 'Read the book, write it up.'],
    project: ['Reading list', 'From a book to a note: To read, Reading, Digesting, Written up.'],
    statuses: ['To read', 'Reading', 'Digesting', 'Written up'],
    issues: [
      ["What does Alice teach about curiosity?", "A question from {{Alice's Adventures in Wonderland}}: why is the tale driven by curiosity, not by fear?\n\nWrite it up as a note, see [[0 Start Here|the start page]] for how issues, notes and books link."],
      ['Read the chapters on the Mad Tea-Party', 'Highlight the lines worth keeping, and make an issue of each one with **New issue of it**. See [[5 Reader|Reader]].'],
      ['Write a note linking Alice to the philosophy of mdSilo', 'An idea: the rabbit hole as a model of the input end. Link [[1 Philosophy|Philosophy]] and the book, then look for the new line in the Graph.'],
    ],
    subtasks: ['Chapter VII', 'Chapter VIII'],
    note: 'The whole book starts with boredom turning into curiosity. See [[1 Philosophy|the philosophy]] of mdSilo: input is where it starts.',
  },
  zh: {
    notes: '手册',
    status: '在读',
    labels: { question: '问题', idea: '想法', reading: '阅读' },
    milestone: ['第一周', '读完这本书，写成笔记。'],
    project: ['阅读清单', '从一本书到一篇笔记：待读、在读、消化、成文。'],
    statuses: ['待读', '在读', '消化', '成文'],
    issues: [
      ['爱丽丝教会我们什么是好奇心？', '读 {{Alice\'s Adventures in Wonderland}} 时的问题：为什么整个故事由好奇心而不是恐惧推动？\n\n把它写成一篇笔记；issue、笔记和书如何互相链接，见 [[0 开始|开始页]]。'],
      ['读疯帽匠茶会的几章', '把值得留下的句子高亮出来，用 **New issue of it** 为每一句建一个 issue。见 [[5 阅读器|阅读器]]。'],
      ['写一篇笔记，把爱丽丝和 mdSilo 的理念连起来', '一个想法：兔子洞是输入端的模型。链接 [[1 理念|理念]] 和这本书，然后到 Graph 里看新出现的那条线。'],
    ],
    subtasks: ['第七章', '第八章'],
    note: '整本书从无聊开始，变成好奇。参见 mdSilo 的 [[1 理念|理念]]：输入是一切的起点。',
  },
};

const BOOK_URL = 'demo/alice.epub';
const BOOK_FILE = 'reading/Alice in Wonderland.epub';
const BOOK_TITLE = "Alice's Adventures in Wonderland";

const NOW = () => new Date().toISOString();
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

/** The labels of the demo: removed with it, if no issue of yours uses them. */
const labelsOf = (lang: DemoLang) => {
  const { question, idea, reading } = TEXT[lang].labels;
  return [
    { id: 'demo-question', name: question, color: '#d876e3' },
    { id: 'demo-idea', name: idea, color: '#fbca04' },
    { id: 'demo-reading', name: reading, color: '#0e8a16' },
  ];
};

const COLORS = ['#6b7280', '#2563eb', '#d97706', '#16a34a'];
const STATUS_IDS = ['toread', 'reading', 'digesting', 'written'];

function issue(number: number, title: string, body: string, labels: string[], extra: Record<string, unknown> = {}) {
  const at = NOW();
  return {
    number,
    title,
    body,
    state: 'open',
    labels,
    notes: [],
    timeline: [{ id: `demo-e${number}`, kind: 'event', event: 'opened', createdAt: at }],
    createdAt: at,
    updatedAt: at,
    ...extra,
  };
}

function issuesOf(lang: DemoLang) {
  const t = TEXT[lang];
  const [q, r, i] = ['demo-question', 'demo-reading', 'demo-idea'];
  return [
    issue(1, t.issues[0][0], t.issues[0][1], [q, r], { milestone: 'demo-week1', dueOn: day(7) }),
    issue(2, t.issues[1][0], t.issues[1][1], [r], {
      milestone: 'demo-week1',
      subtasks: [
        { id: 'demo-s1', text: t.subtasks[0], done: true },
        { id: 'demo-s2', text: t.subtasks[1], done: false },
      ],
    }),
    issue(3, t.issues[2][0], t.issues[2][1], [i]),
  ];
}

function issueMetaOf(lang: DemoLang, count: number) {
  const t = TEXT[lang];
  return {
    version: 1,
    nextNumber: count + 1,
    labels: [
      ...labelsOf(lang),
      { id: 'demo-bug', name: 'bug', color: '#d73a4a' },
      { id: 'demo-enhancement', name: 'enhancement', color: '#a2eeef' },
    ],
    milestones: [{ id: 'demo-week1', title: t.milestone[0], description: t.milestone[1], dueOn: day(7), state: 'open' }],
    projects: [
      {
        id: 'demo-project',
        title: t.project[0],
        description: t.project[1],
        statuses: STATUS_IDS.map((id, n) => ({
          id,
          name: t.statuses[n],
          color: COLORS[n],
          ...(n === 3 ? { closes: true } : {}),
        })),
        items: [
          { issue: 1, status: 'reading', order: 0 },
          { issue: 2, status: 'reading', order: 1 },
          { issue: 3, status: 'digesting', order: 0 },
        ],
        layout: 'board',
      },
    ],
  };
}

const bookEntry = (hash: string, lang: DemoLang) => ({
  hash,
  file: BOOK_FILE,
  title: BOOK_TITLE,
  author: 'Lewis Carroll',
  format: 'EPUB',
  addedAt: NOW(),
  language: ['en'],
  subjects: ['Fantasy fiction', "Children's stories"],
  published: '1865',
  publisher: 'Project Gutenberg',
  status: TEXT[lang].status,
  metaRead: true,
});

/** The highlight to start with: its place in the book file, and its text. */
const HIGHLIGHT = {
  chapter: 'CHAPTER I. Down the Rabbit-Hole',
  cfi: 'epubcfi(/6/6!/4/2[pgepubid00003]/4,/1:1,/1:303)',
  text: 'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, “and what is the use of a book,” thought Alice “without pictures or conversations?”',
};

/** The annotations file of the book with one highlight, see reader/annotations.ts. */
const annotationsOf = (hash: string, lang: DemoLang) => `<!-- mdsilo:book {"hash":"${hash}","title":"${BOOK_TITLE}","author":"Lewis Carroll","file":"Alice in Wonderland.epub"} -->

# ${BOOK_TITLE}

*Lewis Carroll*

## ${HIGHLIGHT.chapter}

<!-- mdsilo:note {"id":"demo-hl-1","type":"annotation","cfi":"${HIGHLIGHT.cfi}","color":"yellow","style":"highlight","chapter":"${HIGHLIGHT.chapter}","createdAt":"${NOW()}","updatedAt":"${NOW()}"} -->
> ${HIGHLIGHT.text}

${TEXT[lang].note}
`;

/** The book of the demo, none if it is not available (offline). */
async function loadBook(lang: DemoLang): Promise<{ files: DemoFile[]; hash?: string }> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${BOOK_URL}`);
    if (!res.ok) return { files: [] };
    const blob = await res.blob();
    const hash = await partialMd5(blob);
    const library = { version: 1, books: { [hash]: bookEntry(hash, lang) } };
    return {
      hash,
      files: [
        { path: BOOK_FILE, data: blob },
        { path: '.mdsilo/books.json', data: JSON.stringify(library, null, 2) },
        { path: `${BOOK_FILE}.md`, data: annotationsOf(hash, lang) },
      ],
    };
  } catch {
    return { files: [] };
  }
}

/** The files of the demo, relative to the workspace, and what to remove it by. */
export async function loadDemo(lang: DemoLang = demoLangOf()): Promise<DemoFile[]> {
  const dir = TEXT[lang].notes;
  const notes = Object.entries(manuals[lang]).map(([file, text]) => ({
    path: `writing/${dir}/${file.split('/').pop()}`,
    data: text,
  }));
  const issues = issuesOf(lang);
  const meta = issueMetaOf(lang, issues.length);
  const issueFiles: DemoFile[] = [
    { path: '.mdsilo/issues/meta.json', data: JSON.stringify(meta, null, 2) },
    ...issues.map((i) => ({ path: `.mdsilo/issues/${i.number}.json`, data: JSON.stringify(i, null, 2) })),
  ];
  const book = await loadBook(lang);
  const marker: DemoMarker = {
    version: 1,
    notes: dir,
    book: book.hash ? { hash: book.hash, files: [BOOK_FILE, `${BOOK_FILE}.md`] } : undefined,
    issues: issues.map((i) => i.number),
    labels: labelsOf(lang).map((l) => l.id),
    milestones: ['demo-week1'],
    projects: ['demo-project'],
  };
  return [...notes, ...issueFiles, ...book.files, { path: DEMO_MARKER, data: JSON.stringify(marker) }];
}
