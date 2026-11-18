import { describe, expect, it } from 'vitest';
import { escapeXml } from './xml';

describe('escapeXml', () => {
  it('escapes markup and drops characters XML 1.0 forbids', () => {
    expect(escapeXml(`a & b < c > "d" 'e'`)).toBe(
      'a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;'
    );
    expect(escapeXml('bell\u0007 and form\u000Cfeed')).toBe('bell and formfeed');
  });
});
