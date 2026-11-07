/*
 * A pure JavaScript implementation of RIPEMD128 using Uint8Array as input/output.
 * By Feng Dihai <fengdh@gmail.com>, 2015/07/09
 *
 * Based on coiscir/jsdigest (https://github.com/coiscir/jsdigest/blob/master/src/hash/ripemd128.js)
 *
 * ripemd128.js is free software released under terms of the MIT License.
 * You can get a copy on http://opensource.org/licenses/MIT.
 *
 *
 * RIPEMD-128 (c) 1996 Hans Dobbertin, Antoon Bosselaers, and Bart Preneel
 */

// implementation

// convert array of number to Uint32Array
function asUint32Array(arr: number[]): Uint32Array {
  return new Uint32Array(arr);
}

// concat 2 typed array
function concat(a: Uint8Array | null, b: Uint8Array | null): Uint8Array {
  if (!a && !b) throw new Error('invalid Buffer a and b');
  if (!b || b.length === 0) return a!;
  if (!a || a.length === 0) return b;

  const c = new (a.constructor as typeof Uint8Array)(a.length + b.length);
  c.set(a);
  c.set(b, a.length);
  return c;
}

// swap high and low bits of a 32-bit int.
function rotl(x: number, n: number): number {
  return (x >>> (32 - n)) | (x << n);
}

// const DIGEST = 128;
// const BLOCK = 64;

const S: Uint32Array[] = [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8], // round 1
  [7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12], // round 2
  [11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5], // round 3
  [11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12], // round 4
  [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6], // parallel round 1
  [9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11], // parallel round 2
  [9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5], // parallel round 3
  [15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8], // parallel round 4
].map(asUint32Array);

const X: Uint32Array[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], // round 1
  [7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8], // round 2
  [3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12], // round 3
  [1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2], // round 4
  [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12], // parallel round 1
  [6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2], // parallel round 2
  [15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13], // parallel round 3
  [8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14], // parallel round 4
].map(asUint32Array);

const K: Uint32Array = asUint32Array([
  0x00000000, // FF
  0x5a827999, // GG
  0x6ed9eba1, // HH
  0x8f1bbcdc, // II
  0x50a28be6, // III
  0x5c4dd124, // HHH
  0x6d703ef3, // GGG
  0x00000000, // FFF
]);

const F: ((x: number, y: number, z: number) => number)[] = [
  function F1(x: number, y: number, z: number): number {
    return x ^ y ^ z;
  },
  function F2(x: number, y: number, z: number): number {
    return (x & y) | (~x & z);
  },
  function F3(x: number, y: number, z: number): number {
    return (x | ~y) ^ z;
  },
  function F4(x: number, y: number, z: number): number {
    return (x & z) | (y & ~z);
  },
];

export function ripemd128(dataBuffer: ArrayBuffer): Uint8Array {
  let aa: number;
  let bb: number;
  let cc: number;
  let dd: number;
  let aaa: number;
  let bbb: number;
  let ccc: number;
  let ddd: number;
  let i: number;
  let l: number;
  let r: number;
  let rr: number;
  let t: number;
  let tmp: number;
  let x: Uint32Array = new Uint32Array();
  const hash = new Uint32Array([
    0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476,
  ]);

  let bytes = dataBuffer.byteLength;
  const dataUint8Array = new Uint8Array(dataBuffer);

  const padding = new Uint8Array((bytes % 64 < 56 ? 56 : 120) - (bytes % 64));
  padding[0] = 0x80;

  const data = new Uint32Array(concat(dataUint8Array, padding).buffer);

  // 以校验位结尾（= 小端64位整数，8 * data.length）
  bytes <<= 3;
  const checkBits = new Uint8Array(8);
  new DataView(checkBits.buffer).setUint32(0, bytes, true);
  new DataView(checkBits.buffer).setUint32(4, bytes >>> 31, true);
  x = new Uint32Array(concat(new Uint8Array(data.buffer), checkBits).buffer);

  // 更新哈希
  for (i = 0, t = 0, l = x.length; i < l; i += 16, t = 0) {
    aa = aaa = hash[0]!;
    bb = bbb = hash[1]!;
    cc = ccc = hash[2]!;
    dd = ddd = hash[3]!;

    for (; t < 64; ++t) {
      r = ~~(t / 16);
      aa = rotl(
        aa + F[r]!(bb, cc, dd) + x[i + X[r]![t % 16]!]! + K[r]!,
        S[r]![t % 16]!,
      );

      tmp = dd;
      dd = cc;
      cc = bb;
      bb = aa;
      aa = tmp;
    }

    for (; t < 128; ++t) {
      r = ~~(t / 16);
      rr = ~~((63 - (t % 64)) / 16);
      aaa = rotl(
        aaa + F[rr]!(bbb, ccc, ddd) + x[i + X[r]![t % 16]!]! + K[r]!,
        S[r]![t % 16]!,
      );

      tmp = ddd;
      ddd = ccc;
      ccc = bbb;
      bbb = aaa;
      aaa = tmp;
    }

    ddd = hash[1]! + cc + ddd;
    hash[1] = hash[2]! + dd + aaa;
    hash[2] = hash[3]! + aa + bbb;
    hash[3] = hash[0]! + bb + ccc;
    hash[0] = ddd;
  }

  return new Uint8Array(hash.buffer);
}
