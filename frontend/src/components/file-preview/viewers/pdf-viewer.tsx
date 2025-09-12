'use client';

import React, { useState, useEffect } from 'react';
import { PreviewableFile } from '@/types/file-preview';
import { createS3PreviewService } from '@/services/s3-preview-service';
import { PreviewError } from '../preview-error';
import { PreviewLoading } from '../preview-loading';
import { useApiS3 } from '@/hooks/use-auth';

interface PDFViewerProps {
  file: PreviewableFile;
}

export function PDFViewer({ file }: PDFViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiS3 = useApiS3();

  useEffect(() => {
    async function loadPDF() {
      try {
        if (!apiS3) return;

        setLoading(true);
        setError(null);

        const s3PreviewService = createS3PreviewService(apiS3);
        const url = await s3PreviewService.getSignedUrl(file);
        setSignedUrl(url);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setLoading(false);
      }
    }

    loadPDF();
  }, [file.key]);

  const handleRetry = () => {
    setError(null);
    setSignedUrl(null);
    setLoading(true);
  };

  if (loading) {
    return <PreviewLoading message={`Loading PDF ${file.name}...`} />;
  }

  if (error) {
    return <PreviewError title="PDF Preview Error" message={error} onRetry={handleRetry} />;
  }

  if (!signedUrl) {
    return (
      <PreviewError
        title="PDF Preview Error"
        message="No PDF URL available"
        onRetry={handleRetry}
      />
    );
  }

  // Use local PDF viewer with the signed URL
  const pdfViewerUrl = `/pdf-viewer.html?file=${encodeURIComponent(signedUrl)}&name=${encodeURIComponent(file.name)}`;

  return (
    <div className="w-full h-full bg-background flex flex-col">
      {/* PDF Viewer */}
      <div className="flex-1 w-full h-full">
        <iframe
          src={pdfViewerUrl}
          className="w-full h-full border-0"
          title={`PDF Viewer - ${file.name}`}
          style={{ minHeight: '600px' }}
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
