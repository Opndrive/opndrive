'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { DiscordCommunityLink } from '@/shared/components/discord/discord-community-link';

const DISMISSED_KEY = 'sidebar_discord_cta_dismissed';

/**
 * Session storage, not local: dismissing should hold for the current tab and
 * the invite should come back on a fresh one. Swap this for `localStorage` to
 * make a dismissal permanent instead.
 */
const dismissStore = () => (typeof window === 'undefined' ? null : window.sessionStorage);

/**
 * Discord invite pinned to the foot of the dashboard sidebar. Rendered as a
 * sibling of the scrolling nav list so it stays put while the items scroll
 * beneath it.
 */
export function SidebarDiscordCta() {
  // Starts hidden so the server render and the first client render agree, and
  // so an already-dismissed invite never flashes in before the check runs.
  const [isVisible, setIsVisible] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setIsVisible(!dismissStore()?.getItem(DISMISSED_KEY));
    } catch {
      // Private-mode storage can throw on access; show the invite regardless.
      setIsVisible(true);
    }
  }, []);

  const dismiss = () => {
    setIsVisible(false);
    try {
      dismissStore()?.setItem(DISMISSED_KEY, '1');
    } catch {
      // Dismissal simply will not persist if storage is unavailable.
    }
  };

  if (!isVisible) return null;

  return (
    <div className="flex-shrink-0 border-t border-border px-3 py-3">
      <div
        ref={rowRef}
        className="group flex items-center rounded-lg text-sm text-secondary-foreground transition-all duration-200 ease-in-out hover:bg-accent hover:text-foreground"
      >
        {/* anchored to the whole row so the connector clears the dismiss button */}
        <DiscordCommunityLink variant="sidebar" placement="right" anchorRef={rowRef} />
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss Discord invite"
          className="mr-2 flex-shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
