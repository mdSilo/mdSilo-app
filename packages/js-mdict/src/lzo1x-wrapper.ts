import lzo from './lzo1x';

function decompress(buf: Uint8Array, _initSize: number, _blockSize: number) {
  const result = lzo.decompress({
    inputBuffer: buf,
    initSize: 16000,
    blockSize: 8192,
  });
  return result;
}

function compress(state : { inputBuffer: Uint8Array; outBuffer: Uint8Array; }) {
  return lzo.compress(state);
}

export { decompress, compress };
export default { decompress, compress };
