import { md5 } from 'js-md5';
import { partialMd5 } from './partialMd5';

describe('partialMd5', () => {
  test('a small file whole', async () => {
    expect(await partialMd5(new Blob(['hello']))).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  test('the chunks at 0, 1 KiB and 4 KiB', async () => {
    const data = Uint8Array.from({ length: 5000 }, (_, i) => i % 251);
    const expected = md5.create();
    expected.update(data.slice(0, 1024));
    expected.update(data.slice(1024, 2048));
    expected.update(data.slice(4096, 5000));
    expect(await partialMd5(new Blob([data]))).toBe(expected.hex());
  });
});
