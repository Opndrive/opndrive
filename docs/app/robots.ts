import type { MetadataRoute } from 'next';
import { DOCS_URL } from '@/lib/site';

/** Everything on the docs site is public, so nothing is disallowed. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${DOCS_URL}/sitemap.xml`,
  };
}
