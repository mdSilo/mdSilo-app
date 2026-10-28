/**
 * The full-text search of the web version: in a worker where the browser has
 * them, else in the page (e.g. in tests).
 */
import { SearchEngine, type SearchDoc, type SearchHit } from './searchEngine';
import type { SearchRequest } from './searchWorker';

export interface SearchApi {
  put(docs: SearchDoc[]): Promise<void>;
  delete(ids: string[]): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  clear(): Promise<void>;
  search(query: string, kind: string | undefined, limit: number): Promise<SearchHit[]>;
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type Request = SearchRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

function workerSearch(worker: Worker): SearchApi {
  let seq = 0;
  const pending = new Map<number, Pending>();
  worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
    const { id, result, error } = e.data;
    const p = pending.get(id);
    pending.delete(id);
    if (error) p?.reject(new Error(error));
    else p?.resolve(result);
  };
  const call = <T>(request: Request) =>
    new Promise<T>((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ ...request, id });
    });
  return {
    put: (docs) => call({ op: 'put', docs }),
    delete: (ids) => call({ op: 'delete', ids }),
    deletePrefix: (prefix) => call({ op: 'deletePrefix', prefix }),
    clear: () => call({ op: 'clear' }),
    search: (query, kind, limit) => call({ op: 'search', query, kind, limit }),
  };
}

function pageSearch(): SearchApi {
  const engine = new SearchEngine();
  return {
    put: async (docs) => docs.forEach((doc) => engine.put(doc)),
    delete: async (ids) => ids.forEach((id) => engine.delete(id)),
    deletePrefix: async (prefix) => engine.deletePrefix(prefix),
    clear: async () => engine.clear(),
    search: async (query, kind, limit) => engine.search(query, kind, limit),
  };
}

export function createSearch(): SearchApi {
  if (typeof Worker !== 'undefined' && typeof window !== 'undefined' && !import.meta.env?.VITEST) {
    try {
      return workerSearch(new Worker(new URL('./searchWorker.ts', import.meta.url), { type: 'module' }));
    } catch (e) {
      console.warn('No worker for the search, in the page then', e);
    }
  }
  return pageSearch();
}
