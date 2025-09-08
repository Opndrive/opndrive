'use client';

import React, { useState, useEffect } from 'react';
import { PreviewableFile } from '@/types/file-preview';
import { apiS3 } from '@/services/byo-s3-api';

interface ImageViewerProps {
  file: PreviewableFile;
}

export function ImageViewer({ file }: ImageViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    async function loadImage() {
      try {
        console.log('🔍 New ImageViewer: Loading file:', file);

        setLoading(true);
        setError(null);

        // Get the file key (handle both Key and key properties)
        const fileKey = (file as PreviewableFile & { Key?: string }).Key || file.key || file.name;
        console.log('🎯 Using file key:', fileKey);

        if (!fileKey) {
          throw new Error('No file key found');
        }

        console.log('🌐 Calling S3 getSignedUrl...');
        const url = await apiS3.getSignedUrl({
          key: fileKey,
          expiryInSeconds: 3600,
        });

        console.log('✅ Got signed URL:', url);
        setSignedUrl(url);
        setLoading(false);
      } catch (err) {
        console.error('❌ Error loading image:', err);
        setError(err instanceof Error ? err.message : 'Failed to load image');
        setLoading(false);
      }
    }

    loadImage();
  }, [file]);

  if (loading) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--preview-modal-content-bg)' }}
      >
        <div className="flex flex-col items-center space-y-4">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2"
            style={{ borderColor: 'var(--foreground)' }}
          ></div>
          <p style={{ color: 'var(--foreground)' }}>Loading {file.name}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--preview-modal-content-bg)' }}
      >
        <div className="flex flex-col items-center space-y-4">
          <p style={{ color: 'var(--destructive)' }}>Error: {error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded"
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
        <p style={{ color: 'var(--muted-foreground)' }}>No image URL available</p>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ backgroundColor: 'var(--preview-modal-content-bg)' }}
    >
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2"
            style={{ borderColor: 'var(--foreground)' }}
          ></div>
        </div>
      )}

      <img
        src={signedUrl}
        alt={file.name}
        className="max-w-full max-h-full object-contain"
        style={{
          display: imageLoaded ? 'block' : 'none',
        }}
        onLoad={() => {
          console.log('✅ Image loaded successfully');
          setImageLoaded(true);
        }}
        onError={(e) => {
          console.error('❌ Image failed to load:', e);
          setError('Image failed to load');
        }}
      />
    </div>
  );
}
