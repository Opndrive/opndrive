import { SITE_URL } from '@/config/links';
import { isBlogEnabled } from '@/config/features';
import { loadBlogIndexPosts } from '@/lib/wordpress/blog-index';
import { buildRssFeed } from '@/lib/wordpress/rss';

/**
 * /blog/rss.xml, which the blog index advertises in its <head>.
 *
 * It had no route of its own before, so it fell through to /blog/[slug] and
 * answered 500. A static segment here takes precedence over the dynamic one.
 * Regenerated at most hourly; nothing here reads the request, so unlike the
 * pages it can be cached.
 */
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  if (!isBlogEnabled()) {
    return new Response('Not Found', { status: 404 });
  }

  const posts = await loadBlogIndexPosts();
  const feed = buildRssFeed(
    {
      title: 'Opndrive Blog',
      link: `${SITE_URL}/blog`,
      description:
        'Cloud storage management, S3 best practices and guides for managing your own buckets with Opndrive.',
      selfUrl: `${SITE_URL}/blog/rss.xml`,
      postBaseUrl: `${SITE_URL}/blog`,
    },
    posts
  );

  return new Response(feed, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
