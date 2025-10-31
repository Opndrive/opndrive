import { MetadataRoute } from 'next';
import { getAllPostSlugs } from '@/lib/wordpress/service';
import { isBlogEnabled } from '@/config/features';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://opndrive.app';

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
