import type { MetadataRoute } from 'next';
import { generateStaticParamsFor } from 'nextra/pages';
import { pageUrl } from '@/lib/site';

/**
 * The same params the catch-all route builds its pages from, so a page added
 * to content/ shows up here without anyone remembering to list it.
 */
const getPageParams = generateStaticParamsFor('mdxPath');

/**
 * No `lastModified`. The only source for it is git history, and Vercel builds
 * from a shallow clone, so the dates would be wrong rather than missing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const params = await getPageParams();

  return params.map(({ mdxPath }) => ({
    url: pageUrl(Array.isArray(mdxPath) ? mdxPath : [mdxPath]),
  }));
}
