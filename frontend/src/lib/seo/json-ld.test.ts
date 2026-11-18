import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from './json-ld';

describe('serializeJsonLd', () => {
  it('cannot be closed early by a value containing </script>', () => {
    const text = serializeJsonLd({ headline: 'Why </script><script>alert(1)</script> fails' });

    expect(text).not.toContain('<');
    expect(text).toContain('\\u003c/script>');
  });

  it('reads back as the same data', () => {
    const data = { '@type': 'BlogPosting', headline: 'a < b && c > d', tags: ['<x>'] };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
