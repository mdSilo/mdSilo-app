import { afterEach, describe, expect, it, vi } from "vitest";

const O = Object as unknown as Record<string, unknown>;
const M = Map as unknown as Record<string, unknown>;
const nativeObject = O.groupBy;
const nativeMap = M.groupBy;

afterEach(() => {
  O.groupBy = nativeObject;
  M.groupBy = nativeMap;
});

async function loadWithoutNative() {
  delete O.groupBy;
  delete M.groupBy;
  vi.resetModules();
  await import("./polyfills");
}

describe("groupBy polyfills", () => {
  it("adds Object.groupBy when missing", async () => {
    await loadWithoutNative();
    const groupBy = O.groupBy as (
      xs: Iterable<number>,
      f: (x: number, i: number) => string,
    ) => Record<string, number[]>;
    const got = groupBy([1, 2, 3, 4], (x) => (x % 2 ? "odd" : "even"));
    expect(Object.getPrototypeOf(got)).toBeNull();
    expect({ ...got }).toEqual({ odd: [1, 3], even: [2, 4] });
    // takes any iterable and passes the index
    const idx = groupBy(new Set([5, 6]), (_x, i) => String(i));
    expect({ ...idx }).toEqual({ 0: [5], 1: [6] });
  });

  it("adds Map.groupBy when missing", async () => {
    await loadWithoutNative();
    const groupBy = M.groupBy as (
      xs: Iterable<string>,
      f: (x: string) => string | null,
    ) => Map<string | null, string[]>;
    const got = groupBy(["a", "bb", "c"], (x) => (x.length > 1 ? null : x));
    expect([...got]).toEqual([
      ["a", ["a"]],
      [null, ["bb"]],
      ["c", ["c"]],
    ]);
  });

  it("keeps the native ones", async () => {
    vi.resetModules();
    await import("./polyfills");
    expect(O.groupBy).toBe(nativeObject);
    expect(M.groupBy).toBe(nativeMap);
  });
});
