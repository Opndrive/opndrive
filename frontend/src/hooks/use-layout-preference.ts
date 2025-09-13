'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ViewLayout } from '@/features/dashboard/types/file';

const LAYOUT_STORAGE_KEY = 'opndrive-layout-preference';
const DEFAULT_LAYOUT: ViewLayout = 'list';

// Global state to share across all hook instances
let globalLayout: ViewLayout = DEFAULT_LAYOUT;
const listeners = new Set<(layout: ViewLayout) => void>();

export function useLayoutPreference() {
  const [layout, setLayoutState] = useState<ViewLayout>(globalLayout);
  const [isLoaded, setIsLoaded] = useState(false);

  // Subscribe to global layout changes
  useEffect(() => {
    const updateLayout = (newLayout: ViewLayout) => {
      setLayoutState(newLayout);
    };

    listeners.add(updateLayout);

    return () => {
      listeners.delete(updateLayout);
    };
  }, []);

  // Load layout preference from localStorage on mount
  useEffect(() => {
    try {
      const savedLayout = localStorage.getItem(LAYOUT_STORAGE_KEY) as ViewLayout;
      if (savedLayout && (savedLayout === 'list' || savedLayout === 'grid')) {
        globalLayout = savedLayout;
        setLayoutState(savedLayout);
        // Notify all listeners
        listeners.forEach((listener) => listener(savedLayout));
      }
    } catch (error) {
      console.warn('Failed to load layout preference from localStorage:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save layout preference to localStorage and notify all listeners
  const updateLayout = useCallback((newLayout: ViewLayout) => {
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, newLayout);
      globalLayout = newLayout;
      setLayoutState(newLayout);

      // Notify all other hook instances
      listeners.forEach((listener) => listener(newLayout));
    } catch (error) {
      console.warn('Failed to save layout preference to localStorage:', error);
      // Still update state even if localStorage fails
      globalLayout = newLayout;
      setLayoutState(newLayout);
      listeners.forEach((listener) => listener(newLayout));
    }
  }, []);

  return {
    layout,
    setLayout: updateLayout,
    isLoaded, // Useful to prevent hydration mismatches in SSR
  };
}
