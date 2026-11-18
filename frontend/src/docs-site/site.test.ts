/**
 * The docs site's canonical URLs and page metadata (docs/lib/site.ts).
 *
 * Tested here because the docs site has no test runner of its own; this is the
 * suite CI runs. The module has no Nextra imports, so it runs outside Next.
 */
import { describe, expect, it } from 'vitest';
import { isHomePage, pageMetadata, pageRoute, pageUrl } from '../../../docs/lib/site';

const DOCS = 'https://docs.opndrive.app';

describe('pageUrl', () => {
  it('gives the home page the bare origin, however Nextra or Next spells it', () => {
    expect(pageUrl()).toBe(DOCS);
    expect(pageUrl([])).toBe(DOCS);
    expect(pageUrl([''])).toBe(DOCS);
  });

  it('joins segments with no trailing slash', () => {
    expect(pageUrl(['guides', 'uploading-files'])).toBe(`${DOCS}/guides/uploading-files`);
  });

  it('names one canonical for every spelling of the same path', () => {
    // importPage decodes before it looks the page up, so this reaches
    // /guides/uploading-files and must not call itself canonical.
    expect(pageUrl(['guides', 'uploading%2Dfiles'])).toBe(`${DOCS}/guides/uploading-files`);
  });

  it('decodes the whole path first, as Nextra does, so an encoded slash is a slash', () => {
    expect(pageUrl(['guides%2Fuploading-files'])).toBe(`${DOCS}/guides/uploading-files`);
    expect(pageRoute(['guides%2Fuploading-files'])).toBe('/guides/uploading-files');
    expect(pageRoute([''])).toBe('/');
  });

  it("leaves characters a path may carry as Nextra's links write them", () => {
    expect(pageUrl(['guides', 'c++'])).toBe(`${DOCS}/guides/c++`);
    expect(pageUrl(['@opndrive', 'a:b'])).toBe(`${DOCS}/@opndrive/a:b`);
  });

  it('percent-encodes what a URL cannot carry raw', () => {
    expect(pageUrl(['guides', 's3 setup'])).toBe(`${DOCS}/guides/s3%20setup`);
    expect(pageUrl(['guides', 'a#b'])).toBe(`${DOCS}/guides/a%23b`);
  });

  it('percent-encodes the characters XML gives meaning to, for the sitemap', () => {
    // Next.js writes <loc> without escaping it, so these cannot stay raw.
    expect(pageUrl(['guides', "s3-&-r2's"])).toBe(`${DOCS}/guides/s3-%26-r2%27s`);
  });

  it('keeps a segment that is not valid percent-encoding, encoded', () => {
    expect(pageUrl(['guides', '100%'])).toBe(`${DOCS}/guides/100%25`);
  });
});

describe('pageMetadata', () => {
  it('adds the canonical, og:url and the shared Open Graph fields', () => {
    const metadata = pageMetadata({ title: 'Uploading Files' }, ['guides', 'uploading-files']);

    expect(metadata.title).toBe('Uploading Files');
    expect(metadata.alternates).toEqual({ canonical: `${DOCS}/guides/uploading-files` });
    expect(metadata.openGraph).toEqual({
      siteName: 'Opndrive Docs',
      type: 'website',
      locale: 'en_US',
      images: ['/og-image.png'],
      url: `${DOCS}/guides/uploading-files`,
    });
  });

  it("keeps a page's own Open Graph image and description", () => {
    const metadata = pageMetadata(
      {
        title: 'Guides',
        openGraph: { images: ['/guides-card.png'], description: 'Every guide' },
      },
      ['guides', 'uploading-files']
    );

    expect(metadata.openGraph).toMatchObject({
      siteName: 'Opndrive Docs',
      images: ['/guides-card.png'],
      description: 'Every guide',
      url: `${DOCS}/guides/uploading-files`,
    });
  });

  it("keeps a page's own alternates beside the canonical, which is always its own", () => {
    const metadata = pageMetadata(
      {
        title: 'Guides',
        alternates: { canonical: 'https://elsewhere.example', languages: { de: '/de/guides' } },
      },
      ['guides']
    );

    expect(metadata.alternates).toEqual({
      canonical: `${DOCS}/guides`,
      languages: { de: '/de/guides' },
    });
  });

  it("keeps the shared card and handle under a page's own Twitter fields", () => {
    const metadata = pageMetadata({ title: 'FAQ', twitter: { title: 'Opndrive FAQ' } }, [
      'reference',
      'faq',
    ]);

    expect(metadata.twitter).toEqual({
      card: 'summary_large_image',
      site: '@opndrive',
      title: 'Opndrive FAQ',
    });
  });

  it('drops the title template on the home page only', () => {
    expect(pageMetadata({ title: 'Opndrive Documentation' }, ['']).title).toEqual({
      absolute: 'Opndrive Documentation',
    });
    expect(pageMetadata({ title: 'FAQ' }, ['reference', 'faq']).title).toBe('FAQ');
  });
});

describe('isHomePage', () => {
  it('is true for every spelling of the home and false for any page', () => {
    expect(isHomePage()).toBe(true);
    expect(isHomePage([])).toBe(true);
    expect(isHomePage([''])).toBe(true);
    expect(isHomePage(['guides'])).toBe(false);
    expect(isHomePage(['guides', 'uploading-files'])).toBe(false);
  });
});
