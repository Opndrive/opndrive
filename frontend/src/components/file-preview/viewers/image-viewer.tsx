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
  const [lastTap, setLastTap] = useState(0);
  const imageContainerRef = React.useRef<HTMLDivElement>(null);
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
  }, [file, apiS3]);

  // Handle wheel events with proper passive: false
  useEffect(() => {
    const container = imageContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale((prev) => Math.min(Math.max(prev * delta, 0.1), 3));
    };

    // Add event listener with passive: false to allow preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const calculateInitialScale = () => {
    if (naturalSize.width === 0 || naturalSize.height === 0) {
      return 1;
    }

    // Get responsive container dimensions
    const isMobile = window.innerWidth < 768;
    const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;

    let containerWidth, containerHeight;

    if (isMobile) {
      // Mobile: account for smaller screen and UI elements
      containerWidth = Math.min(window.innerWidth - 32, 320); // 16px padding each side
      containerHeight = Math.min(window.innerHeight - 200, 400); // Account for header, controls, info
    } else if (isTablet) {
      // Tablet
      containerWidth = Math.min(window.innerWidth - 64, 600);
      containerHeight = Math.min(window.innerHeight - 250, 500);
    } else {
      // Desktop
      containerWidth = 800;
      containerHeight = 500;
    }

    // Calculate scale to fit image within responsive container
    const scaleX = containerWidth / naturalSize.width;
    const scaleY = containerHeight / naturalSize.height;
    const maxScale = isMobile ? 0.9 : 0.8; // Slightly larger on mobile for better visibility
    const fitScale = Math.min(scaleX, scaleY, maxScale);

    return fitScale;
  };

  const handleImageLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.target as HTMLImageElement;

    // Set natural size and show image at actual size (1:1)
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });

    // Open image at actual size (1:1) by default
    setTimeout(() => {
      setScale(1);
      setImageLoaded(true);
      setLoading(false);
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

  // Touch gesture support for mobile
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; distance?: number } | null>(
    null
  );

  const getTouchDistance = (touch1: React.Touch, touch2: React.Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setTouchStart({ x: touch.clientX, y: touch.clientY });
    } else if (e.touches.length === 2) {
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      setTouchStart({ x: 0, y: 0, distance });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;

    if (e.touches.length === 2 && touchStart.distance) {
      // Pinch to zoom
      const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
      const scaleChange = currentDistance / touchStart.distance;
      const newScale = scale * scaleChange;

      if (newScale >= 0.1 && newScale <= 3) {
        setScale(newScale);
        setTouchStart({ ...touchStart, distance: currentDistance });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0 && touchStart && !touchStart.distance) {
      // Double tap to fit/actual size
      const now = Date.now();
      const timeDiff = now - lastTap;

      if (timeDiff < 300 && timeDiff > 0) {
        // Double tap detected
        const currentFitScale = calculateInitialScale();
        if (Math.abs(scale - currentFitScale) < 0.1) {
          handleActualSize();
        } else {
          handleFitToScreen();
        }
      }
      setLastTap(now);
    }
    setTouchStart(null);
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
        className="flex items-center justify-center gap-1 sm:gap-2 p-2 sm:p-3 border-b flex-wrap"
        style={{
          backgroundColor: 'var(--card)',
          borderColor: 'var(--border)',
        }}
      >
        <button
          onClick={handleZoomOut}
          className="p-1.5 sm:p-2 rounded hover:bg-opacity-80 cursor-pointer transition-all"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          title="Zoom Out"
        >
          <ZoomOut size={14} className="sm:w-4 sm:h-4" />
        </button>

        <span
          className="px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-mono min-w-[50px] sm:min-w-[60px] text-center"
          style={{ backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          {Math.round(scale * 100)}%
        </span>

        <button
          onClick={handleZoomIn}
          className="p-1.5 sm:p-2 rounded hover:bg-opacity-80 cursor-pointer transition-all"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          title="Zoom In"
        >
          <ZoomIn size={14} className="sm:w-4 sm:h-4" />
        </button>

        <div
          className="hidden sm:block"
          style={{ width: '1px', height: '20px', backgroundColor: 'var(--border)' }}
        />

        <button
          onClick={handleFitToScreen}
          className="p-1.5 sm:p-2 rounded hover:bg-opacity-80 cursor-pointer transition-all"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          title="Fit to Screen"
        >
          <Maximize2 size={14} className="sm:w-4 sm:h-4" />
        </button>

        <button
          onClick={handleRotate}
          className="p-1.5 sm:p-2 rounded hover:bg-opacity-80 cursor-pointer transition-all"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          title="Rotate"
        >
          <RotateCw size={14} className="sm:w-4 sm:h-4" />
        </button>

        <button
          onClick={handleActualSize}
          className="px-2 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm cursor-pointer hover:bg-opacity-80 transition-all"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          title="Actual Size"
        >
          1:1
        </button>

        <button
          onClick={handleReset}
          className="px-2 sm:px-3 py-1.5 sm:py-2 rounded text-xs sm:text-sm cursor-pointer hover:bg-opacity-80 transition-all"
          style={{ backgroundColor: 'var(--secondary)', color: 'var(--secondary-foreground)' }}
          title="Reset"
        >
          Reset
        </button>
      </div>

      {/* Image Container */}
      <div
        ref={imageContainerRef}
        className="flex-1 flex items-center justify-center overflow-hidden p-2 sm:p-4 relative touch-pan-x touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Loading overlay */}
        {!imageLoaded && (
          <div
            className="absolute inset-0 flex items-center justify-center z-10"
            style={{ backgroundColor: 'var(--background)' }}
          >
            <div className="flex flex-col items-center space-y-4">
              <div
                className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2"
                style={{ borderColor: 'var(--primary)' }}
              ></div>
              <p className="text-sm sm:text-base" style={{ color: 'var(--foreground)' }}>
                Loading image...
              </p>
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
            className="max-w-none max-h-none object-contain rounded shadow-lg select-none"
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              maxWidth: '90vw', // Prevent overflow on mobile
              maxHeight: '70vh', // Prevent overflow on mobile
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
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-2 sm:p-3 border-t text-xs sm:text-sm gap-1 sm:gap-0"
          style={{
            backgroundColor: 'var(--card)',
            borderColor: 'var(--border)',
            color: 'var(--muted-foreground)',
          }}
        >
          <span className="truncate">{file.name}</span>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <span className="whitespace-nowrap">
              {naturalSize.width} × {naturalSize.height}px
            </span>
            <span className="hidden sm:inline">Mouse wheel to zoom • Click and drag to pan</span>
            <span className="sm:hidden text-xs">Pinch to zoom • Double tap to fit</span>
          </div>
        </div>
      )}
    </div>
  );
}
