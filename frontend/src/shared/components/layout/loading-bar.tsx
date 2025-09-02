'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';

interface LoadingBarProps {
  color?: string;
  height?: number;
  className?: string;
}

const LoadingBar = ({
  color = 'var(--top-loading-bar-color)',
  height = 3,
  className = '',
}: LoadingBarProps) => {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Use refs for values we need to access in callbacks
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  const progressRef = useRef<number>(0);
  const lastPathRef = useRef<string | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    isLoadingRef.current = isLoading;
    progressRef.current = progress;
  }, [isLoading, progress]);

  // Function to clean up all animations and timeouts
  const cleanupAnimations = useCallback(() => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }
  }, []);

  // Function to complete the loading process
  const completeLoading = useCallback(() => {
    cleanupAnimations();
    setProgress(100);

    // Reset after completion animation
    timeoutIdRef.current = setTimeout(() => {
      setIsLoading(false);
      setProgress(0);
    }, 400);
  }, [cleanupAnimations]);

  // Function to animate progress smoothly
  const animateProgress = useCallback(() => {
    if (!isLoadingRef.current) return;

    setProgress((prevProgress) => {
      // If we're at 100%, don't go further
      if (prevProgress >= 99.9) return prevProgress;

      // Move faster at the beginning, slower as we approach 80%
      const increment =
        prevProgress < 20 ? 1 : prevProgress < 50 ? 0.8 : prevProgress < 80 ? 0.5 : 0.2;

      // Never exceed 80% in auto mode unless completion is called
      return Math.min(prevProgress + increment, 80);
    });

    // Continue animation if still loading
    animationIdRef.current = requestAnimationFrame(animateProgress);
  }, []);

  // Start loading animation when path changes
  useEffect(() => {
    // Don't do anything on initial mount, wait for actual navigation
    if (lastPathRef.current === null) {
      lastPathRef.current = pathname;
      return;
    }

    // If path hasn't changed, don't trigger loading again
    if (lastPathRef.current === pathname) return;

    // Update last path
    lastPathRef.current = pathname;

    // Start new loading animation
    cleanupAnimations();
    setProgress(0);
    setIsLoading(true);

    // Start the animation
    animationIdRef.current = requestAnimationFrame(animateProgress);

    // Auto-complete after a reasonable timeout
    timeoutIdRef.current = setTimeout(() => {
      completeLoading();
    }, 800);

    // Cleanup on unmount
    return cleanupAnimations;
  }, [pathname, animateProgress, cleanupAnimations, completeLoading]);

  // Handle tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Reset loading bar when tab becomes hidden
        cleanupAnimations();
        setProgress(0);
        setIsLoading(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cleanupAnimations]);

  // Don't render anything if not loading and progress is 0
  if (!isLoading && progress === 0) return null;

  return (
    <div
      className={`fixed top-0 left-0 z-50 w-full ${className}`}
      style={{ height: `${height}px` }}
    >
      <div
        className="h-full transition-transform duration-300 ease-out origin-left"
        style={{
          transform: `scaleX(${progress / 100})`,
          transformOrigin: 'left',
          backgroundColor: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
    </div>
  );
};

export default LoadingBar;
