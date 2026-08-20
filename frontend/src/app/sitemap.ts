import { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/links';
import { getAllPostSlugs } from '@/lib/wordpress/service';
import { isBlogEnabled } from '@/config/features';
import { PROVIDER_SLUGS } from '@/config/providers';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;

  // Get all blog post slugs only if blog is enabled
  let blogPosts: MetadataRoute.Sitemap = [];

  if (isBlogEnabled()) {
    try {
      const postSlugs = await getAllPostSlugs();
      blogPosts = postSlugs.map((slug) => ({
        url: `${baseUrl}/blog/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
    } catch (error) {
      console.error('Error fetching blog posts for sitemap:', error);
      // Continue without blog posts if there's an error
    }
  }

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/connect`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // Generated from the provider registry, so a new provider appears here
    // without anyone remembering to add it. Ranked slightly above the hub
    // because these carry the specific, high-intent queries.
    ...PROVIDER_SLUGS.map((slug) => ({
      url: `${baseUrl}/connect/${slug}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.4,
    },
  ];

  // Only add blog index page if blog is enabled
  if (isBlogEnabled()) {
    staticPages.push({
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    });
  }

  return [...staticPages, ...blogPosts];
}
