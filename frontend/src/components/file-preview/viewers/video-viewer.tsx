'use client';

import React, { useState, useEffect } from 'react';
import { PreviewableFile } from '@/types/file-preview';
import { useApiS3 } from '@/hooks/use-auth';

interface VideoViewerProps {
  file: PreviewableFile;
}

export function VideoViewer({ file }: VideoViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const apiS3 = useApiS3();

  useEffect(() => {
    async function loadVideo() {
      try {
        if (!apiS3) return;
        setLoading(true);
        setError(null);

        // Get the file key (handle both Key and key properties)
        const fileKey = (file as PreviewableFile & { Key?: string }).Key || file.key || file.name;

        if (!fileKey) {
          throw new Error('No file key found');
        }

        const url = await apiS3.getSignedUrl({
          key: fileKey,
          expiryInSeconds: 3600,
          isPreview: false,
        });

        setSignedUrl(url);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load video');
        setLoading(false);
      }
    }

    loadVideo();
  }, [file]);

  const handleRetry = () => {
    setError(null);
    setVideoError(false);
    setSignedUrl(null);
    setLoading(true);
  };

  if (loading) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--preview-modal-content-bg)' }}
      >
        <div className="flex flex-col items-center space-y-4">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2"
            style={{ borderColor: 'var(--primary)' }}
          ></div>
          <p style={{ color: 'var(--foreground)' }}>Loading {file.name}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    // Determine specific error title based on the error message
    let errorTitle = 'Video Preview Error';
    if (error.includes('Failed to load') || error.includes('load video')) {
      errorTitle = 'Failed to Load Video';
    } else if (error.includes('No file key')) {
      errorTitle = 'Video Not Found';
    } else if (error.includes('network') || error.includes('timeout')) {
      errorTitle = 'Connection Error';
    }

    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--preview-modal-content-bg)' }}
      >
        <div className="flex flex-col items-center space-y-4">
          <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
            {errorTitle}
          </h3>
          <p style={{ color: 'var(--destructive)' }}>{error}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 rounded transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--preview-modal-content-bg)' }}
      >
        <p style={{ color: 'var(--muted-foreground)' }}>No video URL available</p>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex flex-col"
      style={{ backgroundColor: 'var(--preview-modal-viewer-bg)' }}
    >
      {/* Video Container */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full h-full max-w-4xl max-h-full">
          <video
            controls
            className="w-full h-full object-contain rounded shadow-lg"
            style={{
              backgroundColor: 'var(--background)',
              border: '1px solid var(--preview-modal-border)',
            }}
            onError={() => {
              setVideoError(true);
            }}
            onLoadStart={() => {}}
            onCanPlay={() => {
              setVideoError(false);
            }}
            preload="metadata"
          >
            <source src={signedUrl} />
            Your browser does not support the video tag.
          </video>

          {videoError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="p-6 rounded-lg text-center"
                style={{ backgroundColor: 'var(--preview-modal-error-bg)' }}
              >
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
                  Video Playback Error
                </h3>
                <p style={{ color: 'var(--preview-modal-error-color)' }}>
                  The video format may not be supported by your browser
                </p>
                <button
                  onClick={handleRetry}
                  className="mt-4 px-4 py-2 rounded transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Video Info */}
      <div
        className="flex items-center justify-between p-3 border-t text-sm"
        style={{
          backgroundColor: 'var(--preview-modal-header-bg)',
          borderColor: 'var(--preview-modal-border)',
          color: 'var(--muted-foreground)',
        }}
      >
        <span>{file.name}</span>
        <div className="flex items-center gap-2">
          <span>Use video controls to play, pause, and adjust volume</span>
        </div>
      </div>
    </div>
  );
}
