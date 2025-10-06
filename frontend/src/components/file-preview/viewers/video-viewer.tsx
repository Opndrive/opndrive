'use client';

import React, { useState, useEffect, useRef } from 'react';
import { PreviewableFile } from '@/types/file-preview';
import { getContentTypeForS3 } from '@/config/file-extensions';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { PreviewLoading } from '../preview-loading';

interface VideoViewerProps {
  file: PreviewableFile;
}

export function VideoViewer({ file }: VideoViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(
    null
  );
  const [isPortrait, setIsPortrait] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { apiS3, isLoading, isAuthenticated } = useAuthGuard();

  if (isLoading) {
    return <PreviewLoading message="Authenticating..." />;
  }

  if (!isAuthenticated || !apiS3) {
    return null;
  }

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
          isPreview: true,
          responseContentType: getContentTypeForS3(fileKey),
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
    setVideoDimensions(null);
    setIsPortrait(false);
  };

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      const { videoWidth, videoHeight } = videoRef.current;
      setVideoDimensions({ width: videoWidth, height: videoHeight });
      setIsPortrait(videoHeight > videoWidth);
      setVideoError(false);
    }
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
            className="px-4 py-2 rounded cursor-pointer transition-colors hover:opacity-80"
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
        <div
          className={`flex items-center justify-center ${
            isPortrait
              ? 'w-auto h-full max-w-[50vw] sm:max-w-[60vh] md:max-w-[70vh] lg:max-w-[80vh]'
              : 'w-full h-full max-w-4xl max-h-full'
          }`}
          style={{
            aspectRatio: videoDimensions
              ? `${videoDimensions.width} / ${videoDimensions.height}`
              : 'auto',
          }}
        >
          <video
            ref={videoRef}
            controls
            className={`rounded shadow-lg ${
              isPortrait
                ? 'h-full w-auto max-h-[calc(100vh-8rem)] max-w-full'
                : 'w-full h-full object-contain'
            }`}
            style={{
              backgroundColor: 'var(--background)',
              border: '1px solid var(--preview-modal-border)',
            }}
            onError={() => {
              setVideoError(true);
            }}
            onLoadStart={() => {}}
            onLoadedMetadata={handleVideoLoadedMetadata}
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
                  className="mt-4 px-4 py-2 cursor-pointer rounded transition-colors hover:opacity-80"
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
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 border-t text-sm gap-2"
        style={{
          backgroundColor: 'var(--preview-modal-header-bg)',
          borderColor: 'var(--preview-modal-border)',
          color: 'var(--muted-foreground)',
        }}
      >
        <span className="truncate">{file.name}</span>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs">
          {videoDimensions && (
            <span className="whitespace-nowrap">
              {videoDimensions.width}×{videoDimensions.height}{' '}
              {isPortrait ? '(Portrait)' : '(Landscape)'}
            </span>
          )}
          <span className="hidden sm:inline">•</span>
          <span className="text-xs">Use video controls to play, pause, and adjust volume</span>
        </div>
      </div>
    </div>
  );
}
