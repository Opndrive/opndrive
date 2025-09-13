'use client';

import React, { useState, useEffect } from 'react';
import { PreviewableFile } from '@/types/file-preview';
import { ZoomIn, ZoomOut, RotateCw, Maximize2 } from 'lucide-react';
import { useApiS3 } from '@/hooks/use-auth';
import { getContentTypeForS3 } from '@/config/file-extensions';

interface ImageViewerProps {
  file: PreviewableFile;
}

export function ImageViewer({ file }: ImageViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const apiS3 = useApiS3();

  useEffect(() => {
    async function loadImage() {
      try {
        if (!apiS3) return;

        setLoading(true);
        setError(null);
        setImageLoaded(false);

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

        // Test if the URL is accessible
        const testImg = new Image();
        testImg.crossOrigin = 'anonymous';
        testImg.src = url;

        setSignedUrl(url);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load image');
        setLoading(false);
      }
    }

    loadImage();
  }, [file]);

  const calculateInitialScale = () => {
    if (naturalSize.width === 0 || naturalSize.height === 0) {
      return 1;
    }

    // Get the container dimensions (accounting for header and controls)
    const containerWidth = 800; // Fixed reasonable width
    const containerHeight = 500; // Fixed reasonable height

    // Calculate scale to fit image within container
    const scaleX = containerWidth / naturalSize.width;
    const scaleY = containerHeight / naturalSize.height;
    const fitScale = Math.min(scaleX, scaleY, 0.8); // Max 80% of container to ensure good visibility

    return fitScale;
  };

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.target as HTMLImageElement;

    // Set natural size first
    const newNaturalSize = { width: img.naturalWidth, height: img.naturalHeight };
    setNaturalSize(newNaturalSize);

    // Calculate scale using the new natural size
    const containerWidth = 800;
    const containerHeight = 500;
    const scaleX = containerWidth / newNaturalSize.width;
    const scaleY = containerHeight / newNaturalSize.height;
    const fitScale = Math.min(scaleX, scaleY, 0.8);

    // Auto-fit to screen after image loads
    setTimeout(() => {
      setScale(fitScale);
      // Show image after fit operation completes
      setImageLoaded(true);
      setLoading(false); // Stop loading spinner
    }, 100); // Small delay to ensure smooth transition
  };

  const handleZoomIn = () => setScale((prev) => Math.min(prev * 1.2, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev / 1.2, 0.1));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleFitToScreen = () => {
    const fitScale = calculateInitialScale();
    setScale(fitScale);
  };
  const handleActualSize = () => setScale(1);
  const handleReset = () => {
    setScale(calculateInitialScale());
    setRotation(0);
  };

  if (loading) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--background)' }}
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
    let errorTitle = 'Image Preview Error';
    if (error.includes('Failed to load') || error.includes('load image')) {
      errorTitle = 'Failed to Load Image';
    } else if (error.includes('No file key')) {
      errorTitle = 'Image Not Found';
    } else if (error.includes('network') || error.includes('timeout')) {
      errorTitle = 'Connection Error';
    }

    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--background)' }}
      >
        <div className="text-center space-y-4">
          <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
            {errorTitle}
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-md transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--background)' }}
      >
        <p style={{ color: 'var(--muted-foreground)' }}>No image URL available</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--background)' }}>
      {/* Image Controls */}
      <div
        className="flex items-center justify-center gap-2 p-3 border-b"
        style={{
          backgroundColor: 'var(--card)',
          borderColor: 'var(--border)',
        }}
      >
        <button
          onClick={handleZoomOut}
          className="p-2 rounded hover:bg-opacity-80 transition-all"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          title="Zoom Out"
        >
          <ZoomOut size={16} />
        </button>

        <span
          className="px-3 py-1 rounded text-sm font-mono min-w-[60px] text-center"
          style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          {Math.round(scale * 100)}%
        </span>

        <button
          onClick={handleZoomIn}
          className="p-2 rounded hover:bg-opacity-80 transition-all"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          title="Zoom In"
        >
          <ZoomIn size={16} />
        </button>

        <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border)' }} />

        <button
          onClick={handleFitToScreen}
          className="p-2 rounded hover:bg-opacity-80 transition-all"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          title="Fit to Screen"
        >
          <Maximize2 size={16} />
        </button>

        <button
          onClick={handleRotate}
          className="p-2 rounded hover:bg-opacity-80 transition-all"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          title="Rotate"
        >
          <RotateCw size={16} />
        </button>

        <button
          onClick={handleActualSize}
          className="px-3 py-2 rounded text-sm hover:bg-opacity-80 transition-all"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          title="Actual Size"
        >
          1:1
        </button>

        <button
          onClick={handleReset}
          className="px-3 py-2 rounded text-sm hover:bg-opacity-80 transition-all"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          title="Reset"
        >
          Reset
        </button>
      </div>

      {/* Image Container */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-4 relative">
        {/* Loading overlay */}
        {!imageLoaded && (
          <div
            className="absolute inset-0 flex items-center justify-center z-10"
            style={{ backgroundColor: 'var(--background)' }}
          >
            <div className="flex flex-col items-center space-y-4">
              <div
                className="animate-spin rounded-full h-8 w-8 border-b-2"
                style={{ borderColor: 'var(--primary)' }}
              ></div>
              <p style={{ color: 'var(--foreground)' }}>Fitting image to screen...</p>
            </div>
          </div>
        )}

        <div
          className="flex items-center justify-center"
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transition: 'transform 0.2s ease-out',
            opacity: imageLoaded ? 1 : 0,
          }}
        >
          <img
            src={signedUrl}
            alt={file.name}
            className="max-w-none max-h-none object-contain rounded shadow-lg"
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
            }}
            onLoad={handleImageLoad}
            onError={() => {
              setError('Failed to load image');
              setLoading(false); // Stop loading on error
            }}
            draggable={false}
          />
        </div>
      </div>

      {/* Image Info */}
      {imageLoaded && (
        <div
          className="flex items-center justify-between p-3 border-t text-sm"
          style={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
            color: 'var(--muted-foreground)',
          }}
        >
          <span>{file.name}</span>
          <div className="flex items-center gap-4">
            <span>
              {naturalSize.width} × {naturalSize.height}px
            </span>
            <span>Mouse wheel to zoom • Click and drag to pan</span>
          </div>
        </div>
      )}
    </div>
  );
}
