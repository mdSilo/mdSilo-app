/// <reference lib="webworker" />
/**
 * The search of the web version in a worker: indexing the notes does not
 * block the page. See searchClient.ts.
 */
import { SearchEngine, type SearchDoc } from "./searchEngine";

const engine = new SearchEngine();

export type SearchRequest =
  | { id: number; op: "put"; docs: SearchDoc[] }
  | { id: number; op: "delete"; ids: string[] }
  | { id: number; op: "deletePrefix"; prefix: string }
  | { id: number; op: "clear" }
  | { id: number; op: "dump" }
  | { id: number; op: "load"; text: string }
  | { id: number; op: "search"; query: string; kind?: string; limit: number };

self.onmessage = (e: MessageEvent<SearchRequest>) => {
  const req = e.data;
  try {
    let result: unknown;
    switch (req.op) {
      case "put":
        req.docs.forEach((doc) => engine.put(doc));
        break;
      case "delete":
        req.ids.forEach((id) => engine.delete(id));
        break;
      case "deletePrefix":
        engine.deletePrefix(req.prefix);
        break;
      case "clear":
        engine.clear();
        break;
      case "dump":
        result = engine.dump();
        break;
      case "load":
        result = engine.load(req.text);
        break;
      case "search":
        result = engine.search(req.query, req.kind, req.limit);
        break;
    }
    self.postMessage({ id: req.id, result });
  } catch (error) {
    self.postMessage({ id: req.id, error: String(error) });
  }
};
