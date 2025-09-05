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

  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  const progressRef = useRef<number>(0);
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    isLoadingRef.current = isLoading;
    progressRef.current = progress;
  }, [isLoading, progress]);

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

  const completeLoading = useCallback(() => {
    cleanupAnimations();
    setProgress(100);

    timeoutIdRef.current = setTimeout(() => {
      setIsLoading(false);
      setProgress(0);
    }, 400);
  }, [cleanupAnimations]);

  const animateProgress = useCallback(() => {
    if (!isLoadingRef.current) return;

    setProgress((prevProgress) => {
      if (prevProgress >= 99.9) return prevProgress;

      const increment =
        prevProgress < 20 ? 1 : prevProgress < 50 ? 0.8 : prevProgress < 80 ? 0.5 : 0.2;

      return Math.min(prevProgress + increment, 80);
    });

    animationIdRef.current = requestAnimationFrame(animateProgress);
  }, []);

  useEffect(() => {
    if (lastPathRef.current === null) {
      lastPathRef.current = pathname;
      return;
    }

    if (lastPathRef.current === pathname) return;

    lastPathRef.current = pathname;

    cleanupAnimations();
    setProgress(0);
    setIsLoading(true);

    animationIdRef.current = requestAnimationFrame(animateProgress);

    timeoutIdRef.current = setTimeout(() => {
      completeLoading();
    }, 800);

    return cleanupAnimations;
  }, [pathname, animateProgress, cleanupAnimations, completeLoading]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
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
