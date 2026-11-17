/**
 * The search page's answer when nothing has matched.
 *
 * A search reads a bounded slice of the bucket per call. When that slice held
 * no matches but more of the bucket is left, "No results found" is a claim
 * about files nobody has looked at, and with no results there was no button
 * to look further either.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const searchState = vi.hoisted(() => ({
  current: {
    search: vi.fn(),
    searchResults: null as unknown,
    isLoading: false,
    canLoadMore: false,
    invalidateCurrentQuery: vi.fn(),
    cancelSearch: vi.fn(),
    requestCount: 0,
    isReady: true,
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/dashboard/search',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/features/dashboard/hooks/use-search', () => ({ useSearch: () => searchState.current }));
vi.mock('@/lib/privacy/private-params', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/privacy/private-params')>()),
  usePrivateParam: () => ({ value: 'quarterly', isHydrated: true, set: vi.fn() }),
}));

// The page's file rows reach for the dashboard's preview context. Nothing here
// opens a preview, so a stand-in is enough.
vi.mock('@/context/file-preview-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/context/file-preview-context')>()),
  useFilePreview: () => ({ openPreview: vi.fn(), closePreview: vi.fn(), state: {} }),
}));

import SearchPage from './page';
import { NotificationProvider } from '@/context/notification-context';

const renderPage = () =>
  render(
    <NotificationProvider>
      <SearchPage />
    </NotificationProvider>
  );

const emptyResults = (nextToken?: string) => ({
  files: [],
  folders: [],
  totalFiles: 0,
  totalFolders: 0,
  totalKeys: 0,
  nextToken,
  isTruncated: Boolean(nextToken),
});

beforeEach(() => {
  vi.clearAllMocks();
  // Past the one-time "searches cost requests" warning, as anyone with
  // results on screen already is.
  localStorage.setItem('opndrive-search-warning-dismissed', 'true');
});

describe('when nothing has matched', () => {
  it('offers to keep searching when more of the bucket is unread', () => {
    searchState.current = {
      ...searchState.current,
      searchResults: emptyResults('resume-here'),
      canLoadMore: true,
    };
    renderPage();

    expect(screen.queryByText('No results found')).toBeNull();
    expect(screen.getByText('No results yet')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Keep searching' }));

    expect(searchState.current.search).toHaveBeenCalledWith('quarterly', 'resume-here');
  });

  it('says there are no results once the whole bucket has been searched', () => {
    searchState.current = {
      ...searchState.current,
      searchResults: emptyResults(),
      canLoadMore: false,
    };
    renderPage();

    expect(screen.getByText('No results found')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep searching' })).toBeNull();
  });
});
