import { SITE_URL } from '@/config/links';
import { isBlogEnabled } from '@/config/features';
import { isBuilding, loadFeedPosts } from '@/lib/wordpress/blog-index';
import { buildRssFeed } from '@/lib/wordpress/rss';

/**
 * /blog/rss.xml, which the blog index advertises in its <head>.
 *
 * It had no route of its own before, so it fell through to /blog/[slug] and
 * answered 500. A static segment here takes precedence over the dynamic one.
 * Regenerated at most hourly; nothing here reads the request, so unlike the
 * pages it can be cached. The WordPress fetch asks for the same hour - a route
 * is regenerated as often as its shortest-lived fetch. Route config has to be
 * a literal, so a test keeps this equal to FEED_REVALIDATE_SECONDS.
 */
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  if (!isBlogEnabled()) {
    return new Response('Not Found', { status: 404 });
  }

  const posts = await loadFeedPosts();
  if (posts === null && !isBuilding()) {
    // Thrown so Next.js keeps serving the last feed it built rather than
    // caching an empty one for an hour. A build has no last feed and goes on
    // with an empty channel.
    throw new Error('WordPress did not answer; keeping the last feed');
  }
  const feed = buildRssFeed(
    {
      title: 'Opndrive Blog',
      link: `${SITE_URL}/blog`,
      description:
        'Cloud storage management, S3 best practices and guides for managing your own buckets with Opndrive.',
      selfUrl: `${SITE_URL}/blog/rss.xml`,
      postBaseUrl: `${SITE_URL}/blog`,
    },
    posts ?? []
  );

  return new Response(feed, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
