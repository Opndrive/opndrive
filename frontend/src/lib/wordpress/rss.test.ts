import { describe, expect, it } from 'vitest';
import { buildRssFeed, escapeXml } from './rss';

const channel = {
  title: 'Opndrive Blog',
  link: 'https://opndrive.app/blog',
  description: 'Guides & notes',
  selfUrl: 'https://opndrive.app/blog/rss.xml',
  postBaseUrl: 'https://opndrive.app/blog',
};

function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

describe('buildRssFeed', () => {
  it('is a valid, empty RSS 2.0 channel when there are no posts', () => {
    const doc = parse(buildRssFeed(channel, []));

    expect(doc.documentElement.tagName).toBe('rss');
    expect(doc.documentElement.getAttribute('version')).toBe('2.0');
    expect(doc.getElementsByTagName('title')[0]!.textContent).toBe('Opndrive Blog');
    expect(doc.getElementsByTagName('description')[0]!.textContent).toBe('Guides & notes');
    expect(doc.getElementsByTagName('item')).toHaveLength(0);
    // No posts, no build date to report.
    expect(doc.getElementsByTagName('lastBuildDate')).toHaveLength(0);
  });

  it('lists each post with its link, guid and RFC 822 publish date in UTC', () => {
    const doc = parse(
      buildRssFeed(channel, [
        {
          slug: 'cors-for-r2',
          title: 'CORS for R2 & friends',
          excerpt: 'Why the "preflight" fails <and how to fix it>',
          publishedDate: '2026-11-01T09:00:00',
          publishedDateUtc: '2026-11-01T03:30:00Z',
        },
      ])
    );

    const item = doc.getElementsByTagName('item')[0]!;
    const text = (tag: string) => item.getElementsByTagName(tag)[0]!.textContent;
    expect(text('title')).toBe('CORS for R2 & friends');
    expect(text('link')).toBe('https://opndrive.app/blog/cors-for-r2');
    expect(text('guid')).toBe('https://opndrive.app/blog/cors-for-r2');
    expect(text('description')).toBe('Why the "preflight" fails <and how to fix it>');
    // The UTC instant wins over the site's local, zone-less time.
    expect(text('pubDate')).toBe('Sun, 01 Nov 2026 03:30:00 GMT');
    expect(doc.getElementsByTagName('lastBuildDate')[0]!.textContent).toBe(
      'Sun, 01 Nov 2026 03:30:00 GMT'
    );
  });

  it('leaves out a date it cannot read rather than writing "Invalid Date"', () => {
    const xml = buildRssFeed(channel, [
      { slug: 'x', title: 'x', excerpt: '', publishedDate: 'not a date' },
    ]);

    expect(xml).not.toContain('Invalid Date');
    expect(parse(xml).getElementsByTagName('pubDate')).toHaveLength(0);
  });
});

describe('escapeXml', () => {
  it('escapes markup and drops characters XML 1.0 forbids', () => {
    expect(escapeXml(`a & b < c > "d" 'e'`)).toBe(
      'a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;'
    );
    expect(escapeXml('bell\u0007 and form\u000Cfeed')).toBe('bell and formfeed');
  });
});
