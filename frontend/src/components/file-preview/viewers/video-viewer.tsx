'use client';

import React, { useState, useEffect } from 'react';
import { PreviewableFile } from '@/types/file-preview';
import { s3PreviewService } from '@/services/s3-preview-service';
import { PreviewError } from '../preview-error';
import { PreviewLoading } from '../preview-loading';

interface VideoViewerProps {
  file: PreviewableFile;
}

export function VideoViewer({ file }: VideoViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    async function loadVideo() {
      try {
        setLoading(true);
        setError(null);

        const url = await s3PreviewService.getSignedUrl(file);

        setSignedUrl(url);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load video:', err);
        setError(err instanceof Error ? err.message : 'Failed to load video');
        setLoading(false);
      }
    }

    loadVideo();
  }, [file.key]);

  const handleRetry = () => {
    setError(null);
    setVideoError(false);
    setSignedUrl(null);
    setLoading(true);
  };

  if (loading) {
    return <PreviewLoading message={`Loading ${file.name}...`} />;
  }

  if (error) {
    return <PreviewError title="Video Preview Error" message={error} onRetry={handleRetry} />;
  }

  if (!signedUrl) {
    return (
      <PreviewError
        title="Video Preview Error"
        message="No video URL available"
        onRetry={handleRetry}
      />
    );
  }

  if (videoError) {
    return (
      <PreviewError title="Video Load Error" message="Video failed to load" onRetry={handleRetry} />
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <video
        src={signedUrl}
        controls
        preload="metadata"
        className="max-w-full max-h-full object-contain"
        onError={() => setVideoError(true)}
        style={{
          width: 'auto',
          height: 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
