import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { sameSecret } from '@/lib/security/same-secret';

/**
 * Drops the cached blog when WordPress publishes, updates, unpublishes or
 * deletes a post, so readers see the change at once rather than within the
 * minute (posts) or the hour (sitemap, feed).
 *
 * Called by wordpress/mu-plugins/opndrive-revalidate.php:
 *
 *   POST /api/revalidate
 *   x-revalidate-token: <REVALIDATE_SECRET>
 *   { "type": "post", "slug": "the-post-slug" }
 *
 * `type` may also be "page" (with a slug) or "all". Every WordPress request
 * the blog makes is tagged `posts`, the post page, the index, the RSS feed and
 * the sitemap included, so refreshing that tag refreshes all of them, and a
 * post whose slug changed or that was unpublished drops out everywhere.
 *
 * There is no GET. It used to take the secret as a query parameter, which
 * puts it in every log the request passes through.
 */

const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET;

/** A WordPress slug: letters, digits, hyphens, and percent-encoded characters. */
const SLUG = /^[a-z0-9%_-]{1,200}$/i;

const TAG = /^[a-z0-9_-]{1,100}$/i;

interface RevalidateRequest {
  type?: unknown;
  slug?: unknown;
  tags?: unknown;
}

function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!REVALIDATE_SECRET) {
    console.error('REVALIDATE_SECRET is not configured');
    return reply(500, { error: 'Server configuration error' });
  }

  if (!sameSecret(request.headers.get('x-revalidate-token'), REVALIDATE_SECRET)) {
    return reply(401, { error: 'Invalid token' });
  }

  let body: RevalidateRequest;
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: 'Body must be JSON' });
  }

  const { type, slug } = body;
  const extraTags = Array.isArray(body.tags) ? body.tags : [];
  if (!extraTags.every((tag): tag is string => typeof tag === 'string' && TAG.test(tag))) {
    return reply(400, { error: 'Invalid tags' });
  }

  if ((type === 'post' || type === 'page') && (typeof slug !== 'string' || !SLUG.test(slug))) {
    return reply(400, { error: 'A valid slug is required' });
  }

  switch (type) {
    case 'post':
      revalidateTag('posts');
      revalidateTag(`post-${slug}`);
      revalidatePath(`/blog/${slug}`);
      revalidatePath('/blog');
      revalidatePath('/blog/rss.xml');
      revalidatePath('/sitemap.xml');
      break;

    case 'page':
      revalidatePath(`/${slug}`);
      break;

    case 'all':
      revalidateTag('posts');
      revalidatePath('/blog', 'layout');
      revalidatePath('/sitemap.xml');
      break;

    default:
      return reply(400, { error: 'Invalid revalidation type' });
  }

  for (const tag of extraTags) revalidateTag(tag);

  return reply(200, {
    revalidated: true,
    type,
    ...(typeof slug === 'string' ? { slug } : {}),
    timestamp: new Date().toISOString(),
  });
}
