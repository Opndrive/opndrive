import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';

/**
 * API Route for On-Demand Revalidation
 * Triggered by WordPress webhooks when content is published/updated
 *
 * Endpoint: POST /api/revalidate
 *
 * Required Headers:
 * - x-revalidate-token: Secret token matching REVALIDATE_SECRET
 *
 * Request Body:
 * {
 *   "type": "post" | "page" | "all",
 *   "slug"?: "post-slug",  // Required if type is "post"
 *   "tags"?: ["tag1", "tag2"]  // Optional cache tags to revalidate
 * }
 *
 * WordPress Webhook Configuration:
 * Install "WP Webhooks" plugin and configure:
 * - Trigger: post_published, post_updated
 * - URL: https://your-domain.com/api/revalidate
 * - Headers: x-revalidate-token: your-secret-token
 * - Payload: { "type": "post", "slug": "{{post_name}}" }
 */

const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET;

interface RevalidateRequest {
  type: 'post' | 'page' | 'all';
  slug?: string;
  tags?: string[];
}

export async function POST(request: NextRequest) {
  // Verify the secret token
  const token = request.headers.get('x-revalidate-token');

  if (!REVALIDATE_SECRET) {
    console.error('REVALIDATE_SECRET is not configured');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  if (token !== REVALIDATE_SECRET) {
    console.error('Invalid revalidation token');
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  try {
    const body: RevalidateRequest = await request.json();
    const { type, slug, tags } = body;

    console.log('[Revalidate] Received request:', { type, slug, tags });

    // Revalidate based on type
    switch (type) {
      case 'post':
        if (!slug) {
          return NextResponse.json(
            { error: 'Slug is required for post revalidation' },
            { status: 400 }
          );
        }

        // Revalidate the specific post page
        await revalidatePath(`/blog/${slug}`);

        // Revalidate the blog index (to update latest posts)
        await revalidatePath('/blog');

        // Revalidate specific cache tags if provided
        if (tags && tags.length > 0) {
          for (const tag of tags) {
            revalidateTag(tag);
          }
        } else {
          // Default: revalidate post-specific tag and posts list tag
          revalidateTag(`post-${slug}`);
          revalidateTag('posts');
        }

        console.log('[Revalidate] Successfully revalidated post:', slug);
        break;

      case 'page':
        if (!slug) {
          return NextResponse.json(
            { error: 'Slug is required for page revalidation' },
            { status: 400 }
          );
        }

        await revalidatePath(`/${slug}`);
        console.log('[Revalidate] Successfully revalidated page:', slug);
        break;

      case 'all':
        // Revalidate all blog-related content
        await revalidatePath('/blog', 'layout'); // Revalidates all blog routes
        revalidateTag('posts');

        console.log('[Revalidate] Successfully revalidated all content');
        break;

      default:
        return NextResponse.json({ error: 'Invalid revalidation type' }, { status: 400 });
    }

    return NextResponse.json({
      revalidated: true,
      type,
      slug,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Revalidate] Error:', error);
    return NextResponse.json(
      {
        error: 'Error revalidating',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Handle GET requests (for testing)
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (token !== REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  return NextResponse.json({
    message: 'Revalidation endpoint is working',
    usage: 'Send POST request with x-revalidate-token header',
  });
}
