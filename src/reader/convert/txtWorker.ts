/// <reference lib="webworker" />
/**
 * A TXT made a book in a worker: the page does not wait on a novel of some
 * MB. See txtInWorker in convert/index.ts.
 */
import { txtToBook } from './text';

export type TxtRequest = { name: string; data: Uint8Array };
export type TxtResponse = { data: Uint8Array } | { error: string };

self.onmessage = async (e: MessageEvent<TxtRequest>) => {
  try {
    const data = await txtToBook(e.data.name, e.data.data);
    (self as DedicatedWorkerGlobalScope).postMessage({ data } satisfies TxtResponse, [data.buffer]);
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) } satisfies TxtResponse);
  }
};
