'use client';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/shared/utils/utils';
import { DashboardSidebarProps, SidebarItem as SidebarItemType } from './types/sidebar';
import { SidebarCreateButton } from './sidebar-create-button';
import { SidebarItem } from './sidebar-item';
import { SidebarDropdown } from './sidebar-dropdown';
import { SidebarDiscordCta } from './sidebar-discord-cta';

/**
 * Bumped when the stored shape changes, so an old blob is ignored rather than
 * parsed into something the current code does not expect.
 *
 * Appended as an interpolation rather than written into the literal below, so
 * the static prefix of that template stays exactly `dashboard_sidebar_state`.
 * `storage-keys.test.ts` resolves a key to the text before its first `${` and
 * matches it against the privacy registry by exact string, so moving the
 * version into the prefix would take the key out of the published policy.
 */
const SIDEBAR_STATE_VERSION = ':v2';

/** Matches Tailwind's `lg` breakpoint, which the layout classes below key off. */
const MOBILE_QUERY = '(max-width: 1023px)';

function readOpenSections(key: string): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
  } catch {
    // Corrupt JSON, or storage unavailable in private mode. Start closed.
  }
  return {};
}

export function DashboardSidebar({
  isOpen,
  closeSidebar,
  sidebarItems,
  basePath,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLDivElement>(null);
  // Kept inline as a template with a literal prefix, not moved into a helper:
  // the storage-key scan resolves a const declared in the same file and cannot
  // follow a function call.
  const localStorageKey = useMemo(
    () => `dashboard_sidebar_state${SIDEBAR_STATE_VERSION}${basePath ? `:${basePath}` : ''}`,
    [basePath]
  );

  // Read during the first render rather than from an effect. The previous
  // version had one effect seeding this from the route, one persisting it and
  // one loading it back, all on mount, which is three chances to write over
  // what the user had.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    readOpenSections(localStorageKey)
  );

  const [isSmallScreen, setIsSmallScreen] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(MOBILE_QUERY).matches
  );

  // `matchMedia` rather than a `resize` listener: resize fires continuously
  // while a window is being dragged and every event set state. This fires only
  // when the breakpoint is actually crossed.
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const update = (event: MediaQueryListEvent) => setIsSmallScreen(event.matches);

    setIsSmallScreen(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useScrollLock(isOpen && isSmallScreen);

  // Skips the render that read storage, so mounting alone never writes.
  const hasHydrated = useRef(false);
  useEffect(() => {
    if (!hasHydrated.current) {
      hasHydrated.current = true;
      return;
    }
    try {
      window.localStorage.setItem(localStorageKey, JSON.stringify(openSections));
    } catch {
      // Sidebar state simply will not persist if storage is unavailable.
    }
  }, [openSections, localStorageKey]);

  // Held in a ref so the Escape listener is subscribed once rather than
  // resubscribed every time the parent hands down a new closure.
  const closeSidebarRef = useRef(closeSidebar);
  useEffect(() => {
    closeSidebarRef.current = closeSidebar;
  }, [closeSidebar]);

  useEffect(() => {
    if (!isOpen || !isSmallScreen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSidebarRef.current();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSmallScreen]);

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const isActive = useCallback(
    (itemHref: string) => {
      const fullPath = `${basePath}${itemHref === '/' ? '' : itemHref}`;
      if (itemHref === '/') {
        return pathname === fullPath;
      }
      return pathname === fullPath || pathname.startsWith(fullPath + '/');
    },
    [basePath, pathname]
  );

  /**
   * Derived during render, not seeded by an effect. A section the user has
   * never touched opens because the route is inside it; once they have opened
   * or closed it by hand, that choice wins. The effect this replaces only
   * applied the route-derived state when nothing had been saved yet, so
   * auto-opening silently stopped working after the first toggle.
   */
  const isSectionOpen = (item: SidebarItemType): boolean => {
    const explicit = openSections[item.title];
    if (explicit !== undefined) return explicit;
    return item.children?.some((child) => isActive(child.href)) ?? false;
  };

  const handleMenuItemClick = () => {
    if (isSmallScreen) {
      closeSidebar();
    }
  };

  return (
    <>
      {isOpen && isSmallScreen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}
      <div
        ref={sidebarRef}
        className={cn(
          'bg-secondary flex flex-col z-30 h-[calc(100vh-3.5rem)]',
          // Mobile: fixed positioning with slide animation
          'fixed lg:static left-0 w-64 overflow-x-hidden',
          'transition-all duration-300 ease-in-out',
          // Mobile visibility
          isSmallScreen ? (isOpen ? 'translate-x-0' : '-translate-x-full') : '',
          // Desktop: flex-shrink behavior
          !isSmallScreen ? (isOpen ? 'w-64' : 'w-0 overflow-hidden') : ''
        )}
      >
        <div
          className={cn('flex-1 overflow-y-auto overflow-x-hidden py-4', isOpen ? 'px-3' : 'px-0')}
        >
          {/* Only show content when sidebar is open */}
          {isOpen && (
            <>
              {/* Create Button */}
              <SidebarCreateButton />

              {/*
                A flat list. This used to run through `groupSidebarItems`, which
                returned one section with `showSeparator: false` no matter what
                it was given - so the separator could never draw and the loop
                around it could only ever run once. Grouping can come back
                described by data when something actually needs it.
              */}
              <nav aria-label="Dashboard" className="space-y-1 mb-4">
                {sidebarItems.map((item) =>
                  item.children ? (
                    <SidebarDropdown
                      key={item.title}
                      item={item}
                      isOpen={isSectionOpen(item)}
                      onToggle={() => toggleSection(item.title)}
                      basePath={basePath}
                      isActive={isActive}
                      onItemClick={handleMenuItemClick}
                    />
                  ) : (
                    <SidebarItem
                      key={item.title}
                      item={item}
                      basePath={basePath}
                      isActive={isActive}
                      onItemClick={handleMenuItemClick}
                    />
                  )
                )}
              </nav>
            </>
          )}
        </div>

        {/* Pinned below the scrolling list, so the nav items pass behind it */}
        {isOpen && <SidebarDiscordCta />}
      </div>
    </>
  );
}
