import { isBlogEnabled } from '@/config/features';
import { isWordPressConfigured } from '@/lib/wordpress/client';
import { getPostBySlug } from '@/lib/wordpress/service';
import { renderBlogCover } from '@/lib/blog-cover/render-cover';

/**
 * /blog/<slug>/cover.png: the post's cover drawn from its title, for posts
 * whose author set no picture of their own. Its address carries the post's
 * modified time (see generatedCoverPath), so a day's caching never serves an
 * old title for long.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  if (!isBlogEnabled() || !isWordPressConfigured()) {
    return new Response('Not Found', { status: 404 });
  }

  const { slug } = await params;
  // A WordPress failure is thrown on (500, retried by crawlers), as the post
  // page does; only a post WordPress says does not exist is a 404.
  const post = await getPostBySlug(slug);
  if (!post) {
    return new Response('Not Found', { status: 404 });
  }

  return renderBlogCover(
    { title: post.title, category: post.categories[0]?.name },
    {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    }
  );
}
