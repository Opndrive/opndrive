'use client';

import { useLayoutPreference } from '@/hooks/use-layout-preference';

/**
 * Hook to get the current layout preference for components that need to render based on layout
 * This is separate from the LayoutToggle component to avoid circular dependencies
 * This hook automatically re-renders when layout changes globally
 */
export function useCurrentLayout() {
  const { layout, isLoaded } = useLayoutPreference();

  return {
    layout,
    isLoaded,
    isListView: layout === 'list',
    isGridView: layout === 'grid',
  };
}
