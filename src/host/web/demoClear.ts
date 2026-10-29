/**
 * Remove the demo of the first run (see demo.ts): the manual, the book, its
 * annotations and the issues, board and labels of the demo. What you added
 * stays: the issues you made, the labels they use, the other books.
 */
import * as fs from './fs';
import { DEFAULT_DIR } from './fs';
import { DEMO_MARKER, type DemoMarker } from './demo';

const at = (path: string) => `${DEFAULT_DIR}/${path}`;

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readText(at(path))) as T;
  } catch {
    return undefined;
  }
}

const writeJson = (path: string, data: unknown) => fs.writeFile(at(path), JSON.stringify(data, null, 2));

async function readMarker(): Promise<DemoMarker | undefined> {
  if (!(await fs.isFile(at(DEMO_MARKER)))) return undefined;
  return readJson<DemoMarker>(DEMO_MARKER);
}

/** The workspace has the demo of the first run. */
export async function hasDemo(): Promise<boolean> {
  return Boolean(await readMarker());
}

type Issue = { number: number; labels?: string[]; milestone?: string; timeline?: { id?: string }[] };
type Meta = {
  labels?: { id: string }[];
  milestones?: { id: string }[];
  projects?: { id: string; items?: { issue: number }[] }[];
};

/** The issues of the demo not touched: the issues you made are never removed. */
async function removeIssues(marker: DemoMarker): Promise<Issue[]> {
  const left: Issue[] = [];
  const gone: number[] = [];
  const dir = '.mdsilo/issues';
  for (const entry of await fs.readDir(at(dir))) {
    const num = /^(\d+)\.json$/.exec(entry.name)?.[1];
    if (!num) continue;
    const issue = await readJson<Issue>(`${dir}/${entry.name}`);
    if (issue && marker.issues.includes(issue.number) && issue.timeline?.[0]?.id === `demo-e${issue.number}`) {
      gone.push(issue.number);
    } else if (issue) {
      left.push(issue);
    }
  }
  await fs.remove(gone.map((n) => at(`${dir}/${n}.json`)));

  const meta = await readJson<Meta>(`${dir}/meta.json`);
  if (meta) {
    const usedLabels = new Set(left.flatMap((i) => i.labels ?? []));
    const usedMilestones = new Set(left.map((i) => i.milestone));
    meta.labels = meta.labels?.filter((l) => !marker.labels.includes(l.id) || usedLabels.has(l.id));
    meta.milestones = meta.milestones?.filter((m) => !marker.milestones.includes(m.id) || usedMilestones.has(m.id));
    meta.projects = meta.projects
      ?.map((p) => (marker.projects.includes(p.id) ? { ...p, items: p.items?.filter((i) => !gone.includes(i.issue)) } : p))
      .filter((p) => !marker.projects.includes(p.id) || (p.items?.length ?? 0) > 0);
    await writeJson(`${dir}/meta.json`, meta);
  }
  return left;
}

async function removeBook(book: NonNullable<DemoMarker['book']>) {
  const { hash } = book;
  const covers = '.mdsilo/local/covers';
  const cached = (await fs.isDir(at(covers))) ? (await fs.readDir(at(covers))).filter((e) => e.name.startsWith(hash)) : [];
  await fs.remove([
    ...book.files.map(at),
    at(`.mdsilo/books/${hash}.json`),
    ...cached.map((e) => e.path),
  ]);
  const library = await readJson<{ books?: Record<string, unknown> }>('.mdsilo/books.json');
  if (library?.books && hash in library.books) {
    delete library.books[hash];
    await writeJson('.mdsilo/books.json', library);
  }
}

/** Remove the demo; false if the workspace has none. */
export async function removeDemo(): Promise<boolean> {
  const marker = await readMarker();
  if (!marker) return false;
  await fs.remove([at(`writing/${marker.notes}`)]);
  if (marker.book) await removeBook(marker.book);
  await removeIssues(marker);
  await fs.remove([at(DEMO_MARKER)]);
  return true;
}
