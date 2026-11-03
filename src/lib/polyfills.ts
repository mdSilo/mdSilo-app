// ES2024 builtins missing before Safari 17.4 (iOS 16): foliate-js epub
// parsing and mermaid call Object.groupBy / Map.groupBy. Import first.

type KeyFn<T, K> = (item: T, index: number) => K;

const O = Object as unknown as {
  groupBy?: <T>(items: Iterable<T>, f: KeyFn<T, PropertyKey>) => object;
};
if (typeof O.groupBy !== "function") {
  Object.defineProperty(Object, "groupBy", {
    configurable: true,
    writable: true,
    value<T>(items: Iterable<T>, f: KeyFn<T, PropertyKey>) {
      const out: Record<PropertyKey, T[]> = Object.create(null);
      let i = 0;
      for (const item of items) {
        const key = f(item, i++);
        (out[key] ??= []).push(item);
      }
      return out;
    },
  });
}

const M = Map as unknown as {
  groupBy?: <T, K>(items: Iterable<T>, f: KeyFn<T, K>) => Map<K, T[]>;
};
if (typeof M.groupBy !== "function") {
  Object.defineProperty(Map, "groupBy", {
    configurable: true,
    writable: true,
    value<T, K>(items: Iterable<T>, f: KeyFn<T, K>) {
      const out = new Map<K, T[]>();
      let i = 0;
      for (const item of items) {
        const key = f(item, i++);
        const list = out.get(key);
        if (list) list.push(item);
        else out.set(key, [item]);
      }
      return out;
    },
  });
}

export {};
