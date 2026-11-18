import { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/links';
import { getAllPostSitemapData } from '@/lib/wordpress/service';
import { blogSitemapEntries } from '@/lib/wordpress/blog-index';
import { isBlogEnabled } from '@/config/features';
import { PROVIDER_SLUGS } from '@/config/providers';

/**
 * Rebuilt at most hourly, so the blog appears here with its first post rather
 * than with the next deploy. Middleware skips this route, so it is free to be
 * cached; nothing in it reads the request.
 */
export const revalidate = 3600;

/**
 * No `lastModified` on the app's own pages. They have no recorded edit date,
 * and stamping each with the build time told Google every page changed on
 * every deploy - which teaches it to ignore the field. Blog posts carry the
 * date WordPress last modified them, which is real.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;

  let blogPages: MetadataRoute.Sitemap = [];

  if (isBlogEnabled()) {
    try {
      blogPages = blogSitemapEntries(await getAllPostSitemapData(), baseUrl);
    } catch (error) {
      console.error('Error fetching blog posts for sitemap:', error);
      // Continue without the blog if WordPress cannot be reached
    }
  }

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/connect`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // Generated from the provider registry, so a new provider appears here
    // without anyone remembering to add it. Ranked slightly above the hub
    // because these carry the specific, high-intent queries.
    ...PROVIDER_SLUGS.map((slug) => ({
      url: `${baseUrl}/connect/${slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    {
      url: `${baseUrl}/privacy`,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/terms`,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
  ];

  return [...staticPages, ...blogPages];
}
