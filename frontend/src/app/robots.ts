import { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/links';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = SITE_URL;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /connect and its provider pages are public landing pages and need to
        // be crawlable. /dashboard is private and useless to a crawler.
        disallow: ['/api/', '/dashboard/'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        // /connect and its provider pages are public landing pages and need to
        // be crawlable. /dashboard is private and useless to a crawler.
        disallow: ['/api/', '/dashboard/'],
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
        // /connect and its provider pages are public landing pages and need to
        // be crawlable. /dashboard is private and useless to a crawler.
        disallow: ['/api/', '/dashboard/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
