/**
 * Where the bucket switcher sits in the navbar.
 *
 * Only the placement is asserted here - what the control does is covered by
 * `bucket-switcher.test.tsx`. The point of this file is that adding it did not
 * displace anything: the menu button, the wordmark, the search and the profile
 * are all still where they were.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardNavbar } from './dashboard-navbar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/context/scroll-context', () => ({
  useScroll: () => ({ isSearchHidden: true, setSearchHidden: vi.fn() }),
}));

vi.mock('../../views', () => ({
  SearchPage: () => <div data-testid="search-page" />,
}));

vi.mock('../../views/search/search-bar', () => ({
  SearchBar: () => <div data-testid="search-bar" />,
}));

vi.mock('./navbar-user-profile', () => ({
  default: () => <div data-testid="user-profile" />,
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ switchBucket: vi.fn() }),
}));

vi.mock('@/context/notification-context', () => ({
  useNotification: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

vi.mock('@/features/dashboard/hooks/use-bucket-mutations', () => ({
  useBucketMutations: () => ({
    region: 'us-east-1',
    canChooseRegion: true,
    regionOptions: [],
    isCreating: false,
    deletingBucket: null,
    createBucket: vi.fn(),
    deleteBucket: vi.fn(),
  }),
}));

vi.mock('@/features/dashboard/hooks/use-buckets', () => ({
  useBuckets: () => ({
    buckets: [],
    status: 'idle',
    isLoading: false,
    isLoadingMore: false,
    error: null,
    isDiscoveryUnavailable: false,
    hasMore: false,
    searchTerm: '',
    currentBucketName: 'my-production-bucket',
    setSearchTerm: vi.fn(),
    loadBuckets: vi.fn(),
    loadMore: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('the bucket switcher in the navbar', () => {
  it('sits immediately after the menu button', () => {
    const { container } = render(<DashboardNavbar toggleSidebar={vi.fn()} />);

    // The header's first button is the sidebar toggle - the wordmark beside it
    // is a link, not a button - so the switcher being the second one is what
    // "immediately after the hamburger" means in the DOM.
    const buttons = container.querySelectorAll('header button');
    const switcher = screen.getAllByRole('button', { name: /change bucket/i })[0];

    expect(buttons[1]).toBe(switcher);
  });

  it('is present in the narrow layout as well as the wide one', () => {
    render(<DashboardNavbar toggleSidebar={vi.fn()} />);

    // Both rows are in the DOM at once and chosen between with CSS, so one
    // switcher per row is what a working responsive navbar looks like here.
    expect(screen.getAllByRole('button', { name: /change bucket/i })).toHaveLength(2);
  });

  it('leaves the rest of the navbar where it was', () => {
    render(<DashboardNavbar toggleSidebar={vi.fn()} />);

    expect(screen.getAllByRole('link', { name: /opndrive/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('search-page').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('user-profile').length).toBeGreaterThan(0);
  });

  it('shows the current bucket without being opened', () => {
    render(<DashboardNavbar toggleSidebar={vi.fn()} />);

    expect(screen.getAllByText('my-production-bucket').length).toBeGreaterThan(0);
  });
});
