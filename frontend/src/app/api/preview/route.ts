import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest, NextResponse } from 'next/server';
import { isBlogEnabled } from '@/config/features';
import { isPreviewConfigured, isWordPressConfigured } from '@/lib/wordpress/client';
import { checkPreviewLink } from '@/lib/wordpress/preview-link';
import { getPreviewPost } from '@/lib/wordpress/service';

/**
 * Where WordPress's Preview button lands.
 *
 * Checks the signed link (see preview-link.ts), confirms WordPress has the
 * post, turns on draft mode for this browser and sends it to the preview
 * page. The address it redirects to is built from the checked numeric ID,
 * never from anything else in the request, so this cannot be used to send
 * someone elsewhere.
 */

const PRIVATE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };

function answer(status: number, message: string) {
  return new NextResponse(message, {
    status,
    headers: { ...PRIVATE, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function GET(request: NextRequest) {
  if (!isBlogEnabled() || !isWordPressConfigured() || !isPreviewConfigured()) {
    return answer(404, 'Not found.');
  }

  const params = request.nextUrl.searchParams;
  const check = checkPreviewLink(
    { id: params.get('id'), exp: params.get('exp'), sig: params.get('sig') },
    process.env.BLOG_PREVIEW_SECRET,
    Math.floor(Date.now() / 1000)
  );

  if (!check.ok) {
    if (check.reason === 'not-configured') return answer(404, 'Not found.');
    return answer(
      403,
      check.reason === 'expired'
        ? 'This preview link has expired. Open the preview again from WordPress.'
        : 'This preview link is not valid. Open the preview again from WordPress.'
    );
  }

  let found: boolean;
  try {
    found = (await getPreviewPost(check.postId)) !== null;
  } catch (error) {
    console.error('[Preview] WordPress did not answer:', error);
    return answer(502, 'WordPress did not answer. Try the preview again in a moment.');
  }
  if (!found) return answer(404, 'WordPress has no post this preview can show.');

  (await draftMode()).enable();
  redirect(`/preview/post/${check.postId}`);
}
