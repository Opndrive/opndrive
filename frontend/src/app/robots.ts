import { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/links';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = SITE_URL;

  return {
    rules: [
      // One rule, not three. Googlebot and Bingbot each had a byte-identical
      // copy of this block, including the comment, and `*` already covers them
      // both - so the only thing the duplicates added was three places to keep
      // in step.
      {
        userAgent: '*',
        allow: '/',
        // /connect and its provider pages are public landing pages and need to
        // be crawlable. /dashboard is private and useless to a crawler.
        disallow: ['/api/', '/dashboard/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
