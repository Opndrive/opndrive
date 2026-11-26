import { draftMode } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Ends the preview for this browser. A POST, from the preview banner's
 * button, so a prefetch or a crawler following a link can never trigger it.
 */
export async function POST(request: NextRequest) {
  (await draftMode()).disable();

  return NextResponse.redirect(new URL('/blog', request.url), {
    status: 303,
    headers: { 'Cache-Control': 'no-store' },
  });
}
