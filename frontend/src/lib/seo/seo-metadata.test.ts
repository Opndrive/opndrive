import { describe, expect, it } from 'vitest';
import { generateWebSiteSchema } from './structured-data';
import { BASE_OPEN_GRAPH, pageSocialMetadata, SHARE_IMAGE } from './social';
import { SEO_CONFIG } from './config';

describe('generateWebSiteSchema', () => {
  it('names the site and its home page, and nothing else', () => {
    expect(generateWebSiteSchema()).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Opndrive',
      url: `${SEO_CONFIG.siteUrl}/`,
    });
  });

  it('no longer advertises a sitelinks search box', () => {
    // Retired by Google in November 2024, and its /blog?search= never existed.
    expect(generateWebSiteSchema()).not.toHaveProperty('potentialAction');
  });
});

describe('pageSocialMetadata', () => {
  const metadata = pageSocialMetadata({
    title: 'MinIO Browser and Web UI',
    description: 'A web UI for a self-hosted MinIO server.',
    path: '/connect/minio',
  });

  it("keeps the site's share image, which a page's own openGraph would otherwise drop", () => {
    expect(metadata.openGraph).toMatchObject({
      title: 'MinIO Browser and Web UI',
      description: 'A web UI for a self-hosted MinIO server.',
      url: '/connect/minio',
      siteName: 'Opndrive',
      type: 'website',
      images: [SHARE_IMAGE],
    });
  });

  it("gives the page a large-image Twitter card with its own title, not the home page's", () => {
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'MinIO Browser and Web UI',
      description: 'A web UI for a self-hosted MinIO server.',
      images: [SHARE_IMAGE.url],
    });
  });
});

describe('shared social fields', () => {
  it('take the site name and share image from SEO_CONFIG, the one place they are set', () => {
    expect(SHARE_IMAGE).toMatchObject({
      url: SEO_CONFIG.ogImage,
      width: SEO_CONFIG.ogImageWidth,
      height: SEO_CONFIG.ogImageHeight,
    });
    expect(BASE_OPEN_GRAPH.siteName).toBe(SEO_CONFIG.siteName);
    // Metadata wants a literal here, so it is written out; this keeps it in step.
    expect(BASE_OPEN_GRAPH.type).toBe(SEO_CONFIG.ogType);
  });

  it("uses a page's own image in both previews when it has one", () => {
    const image = { url: '/og-blog.png', width: 1200, height: 630, alt: 'Opndrive Blog' };
    const social = pageSocialMetadata({
      title: 'Blog',
      description: 'Posts',
      path: '/blog',
      image,
    });

    expect(social.openGraph).toMatchObject({ images: [image], url: '/blog' });
    expect(social.twitter).toMatchObject({ images: ['/og-blog.png'] });
  });
});
