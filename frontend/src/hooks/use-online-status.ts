'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

const getSnapshot = () => navigator.onLine;

/** The server cannot know, and assuming online renders no banner to hydrate away. */
const getServerSnapshot = () => true;

/**
 * Whether the browser says it has a network.
 *
 * Only `false` is certain: the browser is sure there is no connection. `true`
 * means it has one, not that the storage provider is reachable, which is why
 * this decides whether to say "you're offline" and nothing more.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
