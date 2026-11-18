import { describe, expect, it } from 'vitest';
import { generateWebSiteSchema } from './structured-data';
import { pageSocialMetadata, SHARE_IMAGE } from './social';
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
