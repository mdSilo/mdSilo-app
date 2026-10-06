import type { Note } from 'types/model';

// Number of buckets: an update copies one bucket (~size/BUCKETS notes)
// plus the bucket array, rather than every note.
const BUCKETS = 128;

// Bucket of the ids seen. Selectors call get() on every store update, and
// hashing a long path costs ~5x a Map lookup (the engine caches string hashes).
const bucketCache = new Map<string, number>();
const BUCKET_CACHE_MAX = 100_000;

const bucketOf = (id: string): number => {
  const cached = bucketCache.get(id);
  if (cached !== undefined) return cached;
  // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const bucket = (h >>> 0) % BUCKETS;
  if (bucketCache.size >= BUCKET_CACHE_MAX) bucketCache.clear();
  bucketCache.set(id, bucket);
  return bucket;
};

type Buckets = ReadonlyArray<ReadonlyMap<string, Note>>;

const EMPTY_BUCKET: ReadonlyMap<string, Note> = new Map();

/**
 * Immutable map of note id to note, for the store.
 *
 * Every change returns a new NoteMap (so React and zustand see a new
 * reference) that shares the unchanged buckets with the old one: updating
 * one note costs about the same with 10 or 10,000 notes, unlike copying a
 * plain object of all notes.
 *
 * Iteration order is stable but not insertion order.
 */
export class NoteMap implements Iterable<Note> {
  static readonly EMPTY = new NoteMap(Array(BUCKETS).fill(EMPTY_BUCKET), 0);

  private valuesCache: readonly Note[] | undefined;

  private constructor(
    private readonly buckets: Buckets,
    readonly size: number,
  ) {}

  /** Build from notes, a record of id to note (e.g. JSON), or a NoteMap. */
  static from(source?: Iterable<Note> | Record<string, Note> | NoteMap | null): NoteMap {
    if (!source) return NoteMap.EMPTY;
    if (source instanceof NoteMap) return source;
    const notes = isIterable(source) ? source : Object.values(source);
    return NoteMap.EMPTY.setMany(notes);
  }

  get(id: string): Note | undefined {
    return this.buckets[bucketOf(id)].get(id);
  }

  has(id: string): boolean {
    return this.buckets[bucketOf(id)].has(id);
  }

  /** All notes, cached: do not mutate. */
  values(): readonly Note[] {
    if (!this.valuesCache) {
      const all: Note[] = [];
      for (const bucket of this.buckets) {
        for (const note of bucket.values()) all.push(note);
      }
      this.valuesCache = all;
    }
    return this.valuesCache;
  }

  keys(): string[] {
    return this.values().map((note) => note.id);
  }

  [Symbol.iterator](): Iterator<Note> {
    return this.values()[Symbol.iterator]();
  }

  /** Plain record of id to note, e.g. to save as JSON. */
  toRecord(): Record<string, Note> {
    const record: Record<string, Note> = {};
    for (const note of this.values()) record[note.id] = note;
    return record;
  }

  toJSON(): Record<string, Note> {
    return this.toRecord();
  }

  /** Insert or replace notes by id. */
  setMany(notes: Iterable<Note>): NoteMap {
    return this.change(notes, (_old, note) => note);
  }

  set(note: Note): NoteMap {
    return this.setMany([note]);
  }

  /** Insert notes, or merge them into the existing ones with the same id. */
  upsertMany(notes: Iterable<Note>): NoteMap {
    return this.change(notes, (old, note) => (old ? { ...old, ...note } : note));
  }

  upsert(note: Note): NoteMap {
    return this.upsertMany([note]);
  }

  /** Merge fields into an existing note; unknown ids are ignored. */
  update(id: string, fields: Partial<Note>): NoteMap {
    const old = this.get(id);
    if (!old) return this;
    return this.change([{ ...old, ...fields, id }], (_old, note) => note);
  }

  delete(id: string): NoteMap {
    const index = bucketOf(id);
    const bucket = this.buckets[index];
    if (!bucket.has(id)) return this;
    const next = new Map(bucket);
    next.delete(id);
    const buckets = this.buckets.slice();
    buckets[index] = next;
    return new NoteMap(buckets, this.size - 1);
  }

  // copy only the buckets the notes fall in, once per change
  private change(
    notes: Iterable<Note>,
    merge: (old: Note | undefined, note: Note) => Note,
  ): NoteMap {
    let buckets: Map<string, Note>[] | undefined;
    const copied = new Set<number>();
    let size = this.size;
    for (const note of notes) {
      const index = bucketOf(note.id);
      if (!buckets) buckets = this.buckets.slice() as Map<string, Note>[];
      if (!copied.has(index)) {
        buckets[index] = new Map(buckets[index]);
        copied.add(index);
      }
      const bucket = buckets[index];
      const old = bucket.get(note.id);
      if (!old) size += 1;
      bucket.set(note.id, merge(old, note));
    }
    return buckets ? new NoteMap(buckets, size) : this;
  }
}

const isIterable = (value: object): value is Iterable<Note> =>
  typeof (value as Iterable<Note>)[Symbol.iterator] === 'function';
