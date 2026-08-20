/**
 * Retired preview route, kept as a redirect.
 *
 * This used to be a second, full-page preview living alongside the modal, with
 * its own metadata fetch and its own URL scheme. Two preview surfaces that did
 * not share a scheme was the confusion behind #155, so the modal now owns the
 * URL and this only forwards into it.
 *
 * The route stays because links to it are already out there, in tabs people
 * opened and bookmarks they kept. The `[etag]` segment is ignored: it pinned a
 * file version, so a link shared before a re-upload stopped resolving. The key
 * alone is what identifies the file now.
 *
 * Those existing links carry the key in the query string, which is what put it
 * in the edge logs in the first place. Nothing can be done about a request that
 * has already been made, but the redirect lands on the hash form, so the key
 * stops being transmitted from the next navigation onward.
 *
 * @route /dashboard/preview/[etag]?key={encodedKey}
 */

'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PreviewLoading } from '@/components/file-preview/preview-loading';
import { generatePreviewUrl } from '@/lib/preview-url';

function PreviewRedirect() {
  const router = useRouter();
  const key = useSearchParams().get('key');

  useEffect(() => {
    // replace, not push: this URL is a staging post, and leaving it in the
    // history would put a redirect between the user and the Back button.
    router.replace(key ? generatePreviewUrl({ key }) : '/dashboard');
  }, [router, key]);

  return <PreviewLoading />;
}

export default function PreviewPage() {
  return (
    <Suspense fallback={<PreviewLoading />}>
      <PreviewRedirect />
    </Suspense>
  );
}
