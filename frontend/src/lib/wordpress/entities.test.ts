import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from './entities';

describe('decodeHtmlEntities', () => {
  it("decodes what WordPress's texturizer writes into titles and excerpts", () => {
    expect(decodeHtmlEntities('Don&#8217;t use public buckets')).toBe('Don’t use public buckets');
    expect(decodeHtmlEntities('Read more &hellip;')).toBe('Read more …');
    expect(decodeHtmlEntities('&#8220;Quoted&#8221; &#8211; dashed')).toBe('“Quoted” – dashed');
    expect(decodeHtmlEntities('S3 &amp; R2')).toBe('S3 & R2');
  });

  it('decodes hex references', () => {
    expect(decodeHtmlEntities('&#x2019;&#X2014;')).toBe('’—');
  });

  it('decodes in one pass, so an escaped entity stays an entity', () => {
    expect(decodeHtmlEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
  });

  it('leaves unknown names and references to non-characters as written', () => {
    expect(decodeHtmlEntities('&notathing; &#0; &#xD800; &#1114112;')).toBe(
      '&notathing; &#0; &#xD800; &#1114112;'
    );
  });

  it('does not treat Object.prototype names as entities', () => {
    expect(decodeHtmlEntities('&constructor; &toString;')).toBe('&constructor; &toString;');
  });

  it('leaves text without entities alone', () => {
    expect(decodeHtmlEntities('Plain text, 100% & more')).toBe('Plain text, 100% & more');
  });
});
