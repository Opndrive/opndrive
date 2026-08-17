/**
 * DeleteRecoveryBanner.
 *
 * This is the one piece of the recovery path that deletes things, so the tests
 * lean on the two rules that keep it safe: never act on a record belonging to
 * another bucket, and never delete anything before the user has seen the count
 * and agreed to it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { DeleteRecoveryBanner } from './delete-recovery-banner';
import { useDriveStore } from '@/context/data-context';
import {
  useDeleteRecoveryStore,
  type InterruptedDelete,
} from '../stores/use-delete-recovery-store';

const listFromPrefix = vi.fn();
const batchDeleteByKeys = vi.fn();
const notifySuccess = vi.fn();
const notifyError = vi.fn();
const routerReplace = vi.fn();
let currentBucket = 'bucket-a';

vi.mock('@/hooks/use-auth-guard', () => ({
  useAuthGuard: () => ({
    apiS3: { listFromPrefix, getBucketName: () => currentBucket },
  }),
}));

vi.mock('@/context/notification-context', () => ({
  useNotification: () => ({
    success: notifySuccess,
    error: notifyError,
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

vi.mock('../hooks/use-delete-operations', () => ({
  useDeleteOperations: () => ({ batchDeleteByKeys }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  usePathname: () => '/dashboard/browse',
}));

function seed(overrides: Partial<InterruptedDelete> = {}) {
  const record: InterruptedDelete = {
    id: 'op-1',
    bucket: 'bucket-a',
    prefix: 'docs/',
    name: 'docs',
    totalItems: 12,
    startedAt: 1000,
    ...overrides,
  };

  useDeleteRecoveryStore.setState({ records: { [record.id]: record } });
}

const records = () => useDeleteRecoveryStore.getState().records;

/** Puts the user at `prefix`, with the listings they would have loaded to get there. */
function standingIn(prefix: string) {
  useDriveStore.setState({
    rootPrefix: '/',
    currentPrefix: prefix,
    cache: {
      '/': {
        folders: [
          {
            Prefix: 'docs/',
            id: 'docs/',
            name: 'docs',
            location: { type: 'my-drive', label: 'My Drive' },
          },
        ],
        files: [],
        isTruncated: false,
      },
      [prefix]: { folders: [], files: [], isTruncated: false },
    },
    status: { '/': 'ready', [prefix]: 'ready' },
  });
}

/** Clicks and lets the handler's promises settle before asserting. */
async function click(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

beforeEach(() => {
  currentBucket = 'bucket-a';
  useDeleteRecoveryStore.setState({ records: {} });
  listFromPrefix.mockReset();
  batchDeleteByKeys.mockReset().mockResolvedValue(undefined);
  notifySuccess.mockReset();
  notifyError.mockReset();
  routerReplace.mockReset();
});

describe('what it shows', () => {
  it('shows nothing when no delete was interrupted', () => {
    render(<DeleteRecoveryBanner />);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('names the folder that did not finish', () => {
    seed();
    render(<DeleteRecoveryBanner />);

    expect(screen.getByText('Deleting "docs" did not finish')).toBeDefined();
  });

  it('says how big the delete was, so the risk is legible', () => {
    seed({ totalItems: 12 });
    render(<DeleteRecoveryBanner />);

    expect(screen.getByText(/removing 12 items when the tab closed/)).toBeDefined();
  });

  it('does not say "1 items"', () => {
    seed({ totalItems: 1 });
    render(<DeleteRecoveryBanner />);

    expect(screen.getByText(/removing 1 item when/)).toBeDefined();
  });

  it('stays hidden for a record belonging to another bucket', () => {
    seed({ bucket: 'bucket-b' });
    render(<DeleteRecoveryBanner />);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('appears again after switching back to that bucket', () => {
    seed({ bucket: 'bucket-b' });
    const { rerender } = render(<DeleteRecoveryBanner />);
    expect(screen.queryByRole('status')).toBeNull();

    currentBucket = 'bucket-b';
    rerender(<DeleteRecoveryBanner />);

    expect(screen.getByRole('status')).toBeDefined();
  });
});

describe('checking what is left', () => {
  it('clears the record when nothing survived', async () => {
    seed();
    listFromPrefix.mockResolvedValue([]);
    render(<DeleteRecoveryBanner />);

    await click(/Check what is left/);

    await waitFor(() => expect(records()).toEqual({}));
    expect(notifySuccess).toHaveBeenCalledWith(expect.stringContaining('nothing was left behind'));
    expect(batchDeleteByKeys).not.toHaveBeenCalled();
  });

  it('reports the count and waits instead of deleting', async () => {
    seed();
    listFromPrefix.mockResolvedValue(['docs/', 'docs/a.txt', 'docs/b.txt']);
    render(<DeleteRecoveryBanner />);

    await click(/Check what is left/);

    expect(await screen.findByText('3 items still left in "docs"')).toBeDefined();
    expect(batchDeleteByKeys).not.toHaveBeenCalled();
    expect(records()['op-1']).toBeDefined();
  });

  it('keeps the record when the listing fails', async () => {
    seed();
    listFromPrefix.mockRejectedValue(new Error('network down'));
    render(<DeleteRecoveryBanner />);

    await click(/Check what is left/);

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(records()['op-1']).toBeDefined();
  });
});

describe('finishing the delete', () => {
  beforeEach(() => {
    seed();
    listFromPrefix.mockResolvedValue(['docs/', 'docs/a.txt', 'docs/b.txt']);
  });

  it('deletes what is left with the marker last, then clears the record', async () => {
    render(<DeleteRecoveryBanner />);
    await click(/Check what is left/);
    await click(/Delete 3 items/);

    await waitFor(() => expect(batchDeleteByKeys).toHaveBeenCalledOnce());
    expect(batchDeleteByKeys).toHaveBeenCalledWith(['docs/a.txt', 'docs/b.txt', 'docs/']);
    await waitFor(() => expect(records()).toEqual({}));
  });

  it('backs out without deleting when the user cancels', async () => {
    render(<DeleteRecoveryBanner />);
    await click(/Check what is left/);
    await click('Cancel');

    expect(batchDeleteByKeys).not.toHaveBeenCalled();
    expect(records()['op-1']).toBeDefined();
    expect(screen.getByText('Deleting "docs" did not finish')).toBeDefined();
  });

  it('keeps the record when the delete fails, so it can be retried', async () => {
    batchDeleteByKeys.mockRejectedValue(new Error('denied'));
    render(<DeleteRecoveryBanner />);
    await click(/Check what is left/);
    await click(/Delete 3 items/);

    await waitFor(() => expect(batchDeleteByKeys).toHaveBeenCalled());
    expect(records()['op-1']).toBeDefined();
  });
});

/**
 * Buckets are switched in place with no reload, so a prompt that kept its state
 * across that switch would offer to delete one bucket's keys while pointed at
 * another. This is the case that guard exists for.
 */
describe('switching bucket mid flow', () => {
  function seedBoth() {
    useDeleteRecoveryStore.setState({
      records: {
        'op-a': {
          id: 'op-a',
          bucket: 'bucket-a',
          prefix: 'docs/',
          name: 'docs',
          totalItems: 3,
          startedAt: 1000,
        },
        'op-b': {
          id: 'op-b',
          bucket: 'bucket-b',
          prefix: 'photos/',
          name: 'photos',
          totalItems: 5,
          startedAt: 2000,
        },
      },
    });
  }

  it('drops the confirm step instead of carrying keys across', async () => {
    seedBoth();
    listFromPrefix.mockResolvedValue(['docs/', 'docs/a.txt', 'docs/b.txt']);
    const { rerender } = render(<DeleteRecoveryBanner />);

    await click(/Check what is left/);
    expect(await screen.findByText('3 items still left in "docs"')).toBeDefined();

    currentBucket = 'bucket-b';
    rerender(<DeleteRecoveryBanner />);

    // Back to the plain prompt, now describing the other bucket's record
    expect(screen.getByText('Deleting "photos" did not finish')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Delete 3 items/ })).toBeNull();
  });

  it('checks the new bucket prefix rather than the old key list', async () => {
    seedBoth();
    listFromPrefix.mockResolvedValue(['docs/', 'docs/a.txt', 'docs/b.txt']);
    const { rerender } = render(<DeleteRecoveryBanner />);
    await click(/Check what is left/);

    currentBucket = 'bucket-b';
    rerender(<DeleteRecoveryBanner />);
    listFromPrefix.mockResolvedValue(['photos/']);
    await click(/Check what is left/);

    expect(listFromPrefix).toHaveBeenLastCalledWith('photos/');
    expect(batchDeleteByKeys).not.toHaveBeenCalled();
  });
});

describe('dismissing', () => {
  it('drops the record without deleting anything', async () => {
    seed();
    render(<DeleteRecoveryBanner />);

    await click('Dismiss');

    expect(records()).toEqual({});
    expect(batchDeleteByKeys).not.toHaveBeenCalled();
    expect(listFromPrefix).not.toHaveBeenCalled();
  });

  it('leaves the user where they are, since the folder may still be there', async () => {
    seed();
    standingIn('docs/2024/');
    render(<DeleteRecoveryBanner />);

    await click('Dismiss');

    expect(routerReplace).not.toHaveBeenCalled();
    expect(useDriveStore.getState().cache['docs/2024/']).toBeDefined();
  });
});

/**
 * The banner shows wherever the reload landed, which can be deep inside the
 * folder it is offering to delete. Finishing the delete from there used to
 * leave the breadcrumb spelling out a path that no longer existed, with the
 * folder still listed at the top until the page was reloaded by hand.
 */
describe('recovering from inside the folder', () => {
  it('steps out to the parent once the delete finishes', async () => {
    seed();
    standingIn('docs/2024/');
    listFromPrefix.mockResolvedValue(['docs/', 'docs/a.txt']);
    render(<DeleteRecoveryBanner />);

    await click(/Check what is left/);
    await click(/Delete 2 items/);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/dashboard'));
  });

  it('forgets the listings the folder left behind', async () => {
    seed();
    standingIn('docs/2024/');
    listFromPrefix.mockResolvedValue(['docs/', 'docs/a.txt']);
    render(<DeleteRecoveryBanner />);

    await click(/Check what is left/);
    await click(/Delete 2 items/);

    await waitFor(() => expect(useDriveStore.getState().cache['docs/2024/']).toBeUndefined());
    expect(useDriveStore.getState().cache['/'].folders).toEqual([]);
  });

  it('cleans up even when the delete had already gone through', async () => {
    seed();
    standingIn('docs/2024/');
    listFromPrefix.mockResolvedValue([]);
    render(<DeleteRecoveryBanner />);

    await click(/Check what is left/);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/dashboard'));
    expect(useDriveStore.getState().cache['/'].folders).toEqual([]);
  });

  // Records are read back from localStorage, so a prefix can be anything
  it('ignores a record that points at the root', async () => {
    seed({ prefix: '/', name: 'everything' });
    useDriveStore.setState({
      rootPrefix: '/',
      currentPrefix: '/',
      cache: {
        '/': {
          folders: [
            {
              Prefix: 'docs/',
              id: 'docs/',
              name: 'docs',
              location: { type: 'my-drive', label: 'My Drive' },
            },
          ],
          files: [],
          isTruncated: false,
        },
      },
      status: { '/': 'ready' },
    });
    listFromPrefix.mockResolvedValue(['a.txt']);
    render(<DeleteRecoveryBanner />);

    await click(/Check what is left/);
    await click(/Delete 1 item/);

    await waitFor(() => expect(batchDeleteByKeys).toHaveBeenCalled());
    expect(routerReplace).not.toHaveBeenCalled();
    expect(useDriveStore.getState().cache['/'].folders).toHaveLength(1);
  });

  it('stays put when the delete fails, since the folder is still there', async () => {
    seed();
    standingIn('docs/2024/');
    listFromPrefix.mockResolvedValue(['docs/', 'docs/a.txt']);
    batchDeleteByKeys.mockRejectedValue(new Error('denied'));
    render(<DeleteRecoveryBanner />);

    await click(/Check what is left/);
    await click(/Delete 2 items/);

    await waitFor(() => expect(batchDeleteByKeys).toHaveBeenCalled());
    expect(routerReplace).not.toHaveBeenCalled();
    expect(useDriveStore.getState().cache['docs/2024/']).toBeDefined();
  });
});
