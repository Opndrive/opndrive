/**
 * MD5, for working out the ETag S3 gives a multipart object. See
 * multipartETag.
 *
 * Not for anything that needs a secure hash: MD5 is broken for that. It is
 * here because S3 uses it, and browsers do not offer it (Web Crypto leaves it
 * out). Small inputs only: the whole message is held in memory, which for an
 * ETag is 16 bytes a part.
 */

/** How far each step rotates, by step (RFC 1321, section 3.4). */
const SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

/**
 * floor(abs(sin(i + 1)) * 2^32), written out rather than computed: Math.sin
 * is not required to round the same way in every engine.
 */
const K = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

/** The 16-byte MD5 digest of `data`. */
export function md5(data: Uint8Array): Uint8Array {
  // The message, a 1 bit, zeros, and its length in bits as 64 bits, little
  // endian, to a whole number of 64-byte blocks.
  const paddedLength = (((data.length + 8) >> 6) + 1) << 6;
  const message = new Uint8Array(paddedLength);
  message.set(data);
  message[data.length] = 0x80;

  const words = new DataView(message.buffer);
  const bits = data.length * 8;
  words.setUint32(paddedLength - 8, bits >>> 0, true);
  words.setUint32(paddedLength - 4, Math.floor(bits / 2 ** 32), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let block = 0; block < paddedLength; block += 64) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let step = 0; step < 64; step++) {
      let f: number;
      let word: number;

      if (step < 16) {
        f = (b & c) | (~b & d);
        word = step;
      } else if (step < 32) {
        f = (d & b) | (~d & c);
        word = (5 * step + 1) % 16;
      } else if (step < 48) {
        f = b ^ c ^ d;
        word = (3 * step + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        word = (7 * step) % 16;
      }

      f = (f + a + K[step]! + words.getUint32(block + word * 4, true)) | 0;
      a = d;
      d = c;
      c = b;
      b = (b + ((f << SHIFT[step]!) | (f >>> (32 - SHIFT[step]!)))) | 0;
    }

    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  const digest = new Uint8Array(16);
  const out = new DataView(digest.buffer);
  out.setUint32(0, a0, true);
  out.setUint32(4, b0, true);
  out.setUint32(8, c0, true);
  out.setUint32(12, d0, true);
  return digest;
}

/** Lower-case hex, two digits a byte. */
export function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}
