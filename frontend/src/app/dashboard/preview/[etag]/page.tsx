/**
 * Route-based File Preview Page
 *
 * This page provides a full-screen, shareable preview for individual files.
 * It works alongside the modal preview system to offer two preview modes:
 *
 * **Route-based Preview (this page)**:
 * - URL: /dashboard/preview/{etag}?key={encodedKey}
 * - Use case: Opening files in new tabs, sharing links, bookmarking
 * - Features: Clean URL, browser navigation, shareable
 * - Single file focus (no prev/next navigation)
 *
 * **Modal Preview** (FilePreviewModal):
 * - In-context overlay within the current page
 * - Use case: Quick preview while browsing files
 * - Features: Multi-file navigation, keyboard shortcuts (ESC, arrows)
 *
 * @route /dashboard/preview/[etag]
 * @param etag - S3 ETag identifier (unique file version)
 * @param key - S3 object key (from the URL hash, so it is never transmitted)
 */

'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useParams, notFound } from 'next/navigation';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { PRIVATE_PARAM_KEY, usePrivateParam } from '@/lib/privacy/private-params';
import { PreviewableFile } from '@/types/file-preview';
import { PreviewHeader } from '@/components/file-preview/preview-header';
import { PreviewContent } from '@/components/file-preview/preview-content';
import { PreviewLoading } from '@/components/file-preview/preview-loading';
import { PreviewError } from '@/components/file-preview/preview-error';

function PreviewPageContent() {
  const params = useParams();
  const { apiS3, isAuthenticated, isLoading: authLoading } = useAuthGuard();

  const [file, setFile] = useState<PreviewableFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const etag = params.etag as string;
  // The key lives in the URL hash, which the server never sees, so it is not
  // readable until the first client effect has run.
  const { value: key, isHydrated: keyReady } = usePrivateParam(PRIVATE_PARAM_KEY);

  // Fetch file metadata
  const fetchFileData = useCallback(async () => {
    if (!apiS3 || !key) {
      setError('Missing required parameters');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch metadata from S3
      const metadata = await apiS3.fetchMetadata(key);

      if (!metadata) {
        setError('File not found');
        setLoading(false);
        return;
      }

      // Verify ETag matches
      const cleanETag = metadata.ETag?.replace(/"/g, '') || '';
      const cleanUrlETag = etag.replace(/"/g, '');

      if (cleanETag !== cleanUrlETag) {
        setError('File version mismatch');
        setLoading(false);
        return;
      }

      // Extract filename from key
      const keyParts = key.split('/');
      const filename = keyParts[keyParts.length - 1] || 'unknown';
      const extension = filename.split('.').pop()?.toLowerCase() || '';

      // Create PreviewableFile object
      const previewableFile: PreviewableFile = {
        id: key,
        name: filename,
        key: key,
        Key: key,
        size: metadata.ContentLength || 0,
        Size: metadata.ContentLength || 0,
        type: extension,
        extension: extension,
        lastModified: metadata.LastModified ? new Date(metadata.LastModified) : undefined,
        LastModified: metadata.LastModified?.toISOString(),
        ETag: metadata.ETag,
        StorageClass: metadata.StorageClass,
      };

      setFile(previewableFile);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching file data:', err);
      setError('Failed to load file');
      setLoading(false);
    }
  }, [apiS3, key, etag]);

  useEffect(() => {
    // Waits for the hash: firing before it is readable would fail on a key
    // that is merely not visible yet.
    if (!authLoading && isAuthenticated && keyReady) {
      fetchFileData();
    }
  }, [authLoading, isAuthenticated, keyReady, fetchFileData]);

  // Handle authentication
  if (authLoading || !keyReady) {
    return <PreviewLoading />;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Redirecting to login...</p>
      </div>
    );
  }

  // Handle missing parameters
  if (!etag || !key) {
    notFound();
  }

  // Handle loading state
  if (loading) {
    return <PreviewLoading />;
  }

  // Handle error state
  if (error || !file) {
    return (
      <div
        className="h-screen w-screen flex flex-col"
        style={{ backgroundColor: 'var(--background)' }}
      >
        <PreviewError message={error || 'Failed to load file'} />
      </div>
    );
  }

  // Render preview - full viewport, no padding/margins
  return (
    <div
      className="h-screen w-screen flex flex-col"
      style={{ backgroundColor: 'var(--background)' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0"
        style={{
          backgroundColor: 'var(--card)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <PreviewHeader
          file={file}
          currentIndex={0}
          totalFiles={1}
          showNavigation={false}
          onClose={() => window.close()}
          canNavigateNext={false}
          canNavigatePrevious={false}
        />
      </div>

      {/* Content - takes remaining space */}
      <div className="flex-1 overflow-hidden" style={{ backgroundColor: 'var(--background)' }}>
        <PreviewContent key={file.key || file.id} file={file} />
      </div>
    </div>
  );
}

export default function PreviewPage() {
  return (
    <Suspense fallback={<PreviewLoading />}>
      <PreviewPageContent />
    </Suspense>
  );
}
