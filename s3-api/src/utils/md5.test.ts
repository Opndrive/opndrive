import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { md5, toHex } from './md5.js';

const ascii = (text: string) => new TextEncoder().encode(text);

describe('md5', () => {
  it('matches the test suite in RFC 1321', () => {
    const suite: [string, string][] = [
      ['', 'd41d8cd98f00b204e9800998ecf8427e'],
      ['a', '0cc175b9c0f1b6a831c399e269772661'],
      ['abc', '900150983cd24fb0d6963f7d28e17f72'],
      ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
      ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
      [
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        'd174ab98d277d9f5a5611c2c9f419d9f',
      ],
      [
        '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
        '57edf4a22be3c955ac49da2e2107b67a',
      ],
    ];

    for (const [input, digest] of suite) expect(toHex(md5(ascii(input)))).toBe(digest);
  });

  it('agrees with Node at every length around a block boundary', () => {
    // 55, 56 and 64 bytes are where the padding spills into another block.
    for (let length = 0; length <= 200; length++) {
      const data = randomBytes(length);
      expect(toHex(md5(data))).toBe(createHash('md5').update(data).digest('hex'));
    }
  });

  it('agrees with Node on the 160,000 bytes of a 10,000-part ETag', () => {
    const data = randomBytes(10_000 * 16);

    expect(toHex(md5(data))).toBe(createHash('md5').update(data).digest('hex'));
  });
});
