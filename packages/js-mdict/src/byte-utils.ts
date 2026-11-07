/**
 * Browser-friendly replacements for the Node `Buffer` helpers used in the
 * codebase. Keep these tiny and dependency-free.
 */

const HEX = '0123456789abcdef';

/**
 * Lowercase hex of `length` bytes from `bytes`. Replaces
 * `Buffer.from(uint8.subarray(0, length)).toString('hex')`.
 */
export function bytesToHex(bytes: Uint8Array, length: number = bytes.length): string {
  let out = '';
  const n = Math.min(length, bytes.length);
  for (let i = 0; i < n; i++) {
    const b = bytes[i]!;
    out += HEX[(b >>> 4) & 0xf]! + HEX[b & 0xf]!;
  }
  return out;
}

/**
 * Standard base64 of `bytes`. Uses `btoa` in browsers and a small fallback in
 * Node (`Buffer.from(...).toString('base64')`) when `btoa` isn't available.
 * Replaces `Buffer.from(uint8).toString('base64')`.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    // Build a binary string and feed to btoa. Use chunks to avoid call-stack
    // overflow on large inputs (e.g. MDD images).
    let bin = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, bytes.length);
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, end)));
    }
    return btoa(bin);
  }
  // Node fallback. `Buffer` only exists in Node, so the global access is gated.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const NodeBuffer = (globalThis as any).Buffer;
  if (NodeBuffer) {
    return NodeBuffer.from(bytes).toString('base64');
  }
  throw new Error('No base64 encoder available');
}

/** Concatenate Uint8Arrays. Replaces `Buffer.concat([...])`. */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/** Inline assert — replaces `import assert from 'assert'`. */
export function assert(cond: unknown, msg?: string): asserts cond {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}
