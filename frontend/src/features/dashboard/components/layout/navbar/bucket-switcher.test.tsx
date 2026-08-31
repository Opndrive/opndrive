/**
 * The navbar bucket switcher.
 *
 * It is a view over two things it does not own: `useBuckets` finds the
 * candidates and `useAuth().switchBucket` performs the switch and owns the
 * whole lifecycle behind it. So the tests here are about what the user sees and
 * what the component asks for - which bucket, which region, and whether it
 * asked before throwing away work in progress - rather than about how either of
 * those two behave, which their own suites cover.
 *
 * Both are mocked for that reason: a real `useBuckets` would make this a test
 * of discovery, and a real `switchBucket` would make it a test of session
 * lifecycle.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BucketSwitcher } from './bucket-switcher';
import type { UseBucketsResult } from '@/features/dashboard/hooks/use-buckets';
import { ConfirmDialogHost } from '@/shared/components/ui/confirm-dialog';

const switchBucket = vi.fn();
const notifyError = vi.fn();
const hookState = vi.fn();

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ switchBucket }),
}));

vi.mock('@/features/dashboard/hooks/use-buckets', () => ({
  useBuckets: () => hookState(),
}));

vi.mock('@/context/notification-context', () => ({
  useNotification: () => ({
    error: notifyError,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

/** The hook's shape, with only the parts a given test cares about overridden. */
function buckets(overrides: Partial<UseBucketsResult> = {}): UseBucketsResult {
  return {
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
    ...overrides,
  };
}

const READY = {
  status: 'ready' as const,
  buckets: [
    { name: 'my-production-bucket', region: 'us-east-1' },
    { name: 'staging-assets', region: 'eu-west-1' },
    { name: 'backups' },
  ],
};

function renderSwitcher(state: UseBucketsResult) {
  hookState.mockReturnValue(state);
  return render(
    <>
      <BucketSwitcher />
      <ConfirmDialogHost />
    </>
  );
}

/**
 * Opens the dropdown and waits for its panel.
 *
 * Radix opens a menu on pointerdown rather than click, so both are fired -
 * `fireEvent.click` alone leaves it shut.
 */
async function open() {
  // `hidden` as a fallback: a dialog that has just closed can still have the
  // rest of the page marked aria-hidden for a tick, and the trigger is behind
  // it. Not a fallback for the first open, which must be reachable outright.
  const trigger =
    screen.queryByRole('button', { name: /change bucket/i }) ??
    screen.getByRole('button', { name: /change bucket/i, hidden: true });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
  await screen.findByRole('menu');
}

/** Clicks a bucket row by name. */
function pick(name: RegExp) {
  fireEvent.click(screen.getByRole('menuitemradio', { name }));
}

function type(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

beforeEach(() => {
  switchBucket.mockReset();
  switchBucket.mockResolvedValue({ status: 'switched', bucketName: 'staging-assets' });
  notifyError.mockReset();
  hookState.mockReset();
});

describe('the closed control', () => {
  it('names the bucket the session is working in', () => {
    renderSwitcher(buckets());

    expect(screen.getByText('my-production-bucket')).toBeDefined();
  });

  it('carries the whole name for a screen reader and a tooltip', () => {
    const long = 'a-very-long-production-bucket-name-that-will-not-fit-in-a-navbar';
    renderSwitcher(buckets({ currentBucketName: long }));

    const trigger = screen.getByRole('button', { name: `Current bucket: ${long}. Change bucket` });

    // The visible label truncates with CSS; the value behind it never does.
    expect(trigger.getAttribute('title')).toBe(long);
  });

  it('asks for nothing until it is opened', () => {
    const state = buckets();
    renderSwitcher(state);

    // The dashboard mounts this on every page, and ListBuckets is billed.
    expect(state.loadBuckets).not.toHaveBeenCalled();
  });

  it('starts discovery when it is opened', async () => {
    const state = buckets();
    renderSwitcher(state);

    await open();

    expect(state.loadBuckets).toHaveBeenCalledTimes(1);
  });
});

describe('the list', () => {
  it('shows each bucket, and its region when the provider gave one', async () => {
    renderSwitcher(buckets(READY));

    await open();

    expect(screen.getByText('staging-assets')).toBeDefined();
    expect(screen.getByText('eu-west-1')).toBeDefined();
    // 'backups' came back without a region, so nothing is claimed about it -
    // showing the session's region here would be an invention.
    expect(screen.getByText('backups')).toBeDefined();
    expect(screen.queryByText('region unknown')).toBeNull();
  });

  it('marks the bucket that is already open', async () => {
    renderSwitcher(buckets(READY));

    await open();

    const current = screen.getByRole('menuitemradio', { name: /my-production-bucket/ });
    expect(current.getAttribute('aria-checked')).toBe('true');
  });

  it('says so when a search matches nothing', async () => {
    renderSwitcher(buckets({ status: 'ready', buckets: [], searchTerm: 'zzz' }));

    await open();

    expect(screen.getByText(/no buckets match/i)).toBeDefined();
  });

  it('reports what it is doing while the first page loads', async () => {
    renderSwitcher(buckets({ status: 'loading', isLoading: true }));

    await open();

    expect(screen.getByText(/loading buckets/i)).toBeDefined();
  });
});

describe('searching', () => {
  it('hands what was typed to the discovery hook', async () => {
    const setSearchTerm = vi.fn();
    renderSwitcher(buckets({ ...READY, setSearchTerm }));

    await open();
    type(screen.getByLabelText(/search buckets/i), 'st');

    // No debounce, no filtering and no request of its own: the hook owns all
    // three, and a second copy here would be a second answer.
    expect(setSearchTerm).toHaveBeenCalledWith('st');
  });

  it('shows the term the hook is holding', async () => {
    renderSwitcher(buckets({ ...READY, searchTerm: 'stag' }));

    await open();

    expect(screen.getByLabelText(/search buckets/i)).toHaveProperty('value', 'stag');
  });
});

describe('paging', () => {
  it('offers more only when the hook says there are more', async () => {
    renderSwitcher(buckets(READY));

    await open();

    expect(screen.queryByText(/load more/i)).toBeNull();
  });

  it('asks the hook for the next page', async () => {
    const loadMore = vi.fn();
    renderSwitcher(buckets({ ...READY, hasMore: true, loadMore }));

    await open();
    fireEvent.click(screen.getByText(/load more/i));

    expect(loadMore).toHaveBeenCalledTimes(1);
    // The menu stays open: a list that closed itself to fetch its own next
    // page would be unusable.
    expect(screen.getByRole('menu')).toBeDefined();
  });

  it('shows the page loading without replacing the list', async () => {
    const loadMore = vi.fn();
    renderSwitcher(buckets({ ...READY, hasMore: true, isLoadingMore: true, loadMore }));

    await open();

    expect(screen.getByText('staging-assets')).toBeDefined();

    const loadingRow = screen.getByText(/^loading\.\.\.$/i);
    fireEvent.click(loadingRow);

    // Disabled while a page is on its way, so an impatient second click cannot
    // ask for the same page twice.
    expect(loadMore).not.toHaveBeenCalled();
  });
});

describe('choosing a bucket', () => {
  it('switches with the region the provider stated', async () => {
    renderSwitcher(buckets(READY));

    await open();
    pick(/staging-assets/);

    await waitFor(() => expect(switchBucket).toHaveBeenCalledWith('staging-assets', 'eu-west-1'));
  });

  it('passes no region for a bucket the provider said nothing about', async () => {
    renderSwitcher(buckets(READY));

    await open();
    pick(/backups/);

    // Not the session's region: the client would be rebuilt for a region the
    // bucket may not be in, and every request would come back a redirect.
    await waitFor(() => expect(switchBucket).toHaveBeenCalledWith('backups', undefined));
  });

  it('does nothing at all when the current bucket is picked', async () => {
    renderSwitcher(buckets(READY));

    await open();
    pick(/my-production-bucket/);

    // Not even to be told "unchanged": there is nothing to ask, and asking
    // could raise the cancel-your-uploads question over a no-op.
    expect(switchBucket).not.toHaveBeenCalled();
  });

  it('cannot start a second switch while one is running', async () => {
    let release!: () => void;
    switchBucket.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ status: 'switched', bucketName: 'staging-assets' });
        })
    );
    renderSwitcher(buckets(READY));

    await open();
    pick(/staging-assets/);
    pick(/backups/);

    expect(switchBucket).toHaveBeenCalledTimes(1);
    release();
  });

  it('keeps the session and stays usable when the bucket will not verify', async () => {
    switchBucket.mockRejectedValue(
      Object.assign(new Error('AccessDenied'), {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      })
    );
    renderSwitcher(buckets(READY));

    await open();
    pick(/staging-assets/);

    // The failure is named rather than swallowed, and the bucket on the
    // trigger is still the one the session is really on.
    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(notifyError.mock.calls[0][0]).toMatch(/not allowed/i);
    // `hidden` because the menu is still open and Radix hides the rest of the
    // page from assistive tech while it is - which is the point: the switcher
    // stayed open, on the bucket the session is genuinely still using.
    expect(
      screen.getByRole('button', {
        name: /current bucket: my-production-bucket/i,
        hidden: true,
      })
    ).toBeDefined();
  });
});

describe('work that a switch would cancel', () => {
  const blocked = { status: 'blocked', activeWork: { uploads: 2, deletes: 1 } };

  it('asks first, naming what is at stake', async () => {
    switchBucket.mockResolvedValueOnce(blocked);
    renderSwitcher(buckets(READY));

    await open();
    pick(/staging-assets/);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/2 uploads and 1 delete are still in progress/i)).toBeDefined();
    // Asked, not assumed: no second call has gone out yet.
    expect(switchBucket).toHaveBeenCalledTimes(1);
  });

  it('counts one of each without pluralising it', async () => {
    switchBucket.mockResolvedValueOnce({
      status: 'blocked',
      activeWork: { uploads: 1, deletes: 0 },
    });
    renderSwitcher(buckets(READY));

    await open();
    pick(/staging-assets/);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/1 upload is still in progress/i)).toBeDefined();
  });

  it('does nothing more if the answer is no', async () => {
    switchBucket.mockResolvedValueOnce(blocked);
    renderSwitcher(buckets(READY));

    await open();
    pick(/staging-assets/);

    const dialog = await screen.findByRole('alertdialog');
    // Exact, because "Switch and cancel" is also a button on this dialog.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(switchBucket).toHaveBeenCalledTimes(1);
  });

  it('only discards the work once a person has said so', async () => {
    switchBucket.mockResolvedValueOnce(blocked);
    renderSwitcher(buckets(READY));

    await open();
    pick(/staging-assets/);

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /switch and cancel/i }));

    await waitFor(() =>
      expect(switchBucket).toHaveBeenLastCalledWith('staging-assets', 'eu-west-1', {
        discardActiveWork: true,
      })
    );
  });
});

describe('when the provider will not list buckets', () => {
  const unavailable = buckets({
    status: 'error',
    isDiscoveryUnavailable: true,
    error: {
      kind: 'permissions',
      title: 'These keys are not allowed to do that',
      detail: 'The key needs permission to list buckets.',
      retryable: false,
      unavailable: true,
    },
  });

  it('offers a name to type instead of claiming the session is broken', async () => {
    renderSwitcher(unavailable);

    await open();

    expect(screen.getByText(/bucket list unavailable/i)).toBeDefined();
    expect(screen.getByLabelText(/bucket name/i)).toBeDefined();
    expect(screen.queryByLabelText(/search buckets/i)).toBeNull();
  });

  it('switches to what was typed, trimmed', async () => {
    renderSwitcher(unavailable);

    await open();
    type(screen.getByLabelText(/bucket name/i), '  typed-bucket  ');
    fireEvent.click(screen.getByRole('button', { name: /switch bucket/i }));

    // No region, because nothing told us one - and no local check that the
    // bucket exists, because that is what the switch itself verifies.
    await waitFor(() => expect(switchBucket).toHaveBeenCalledWith('typed-bucket', undefined));
  });

  it('will not submit an empty name', async () => {
    renderSwitcher(unavailable);

    await open();
    type(screen.getByLabelText(/bucket name/i), '   ');

    expect(screen.getByRole('button', { name: /switch bucket/i })).toHaveProperty('disabled', true);
    expect(switchBucket).not.toHaveBeenCalled();
  });

  it('cannot be submitted twice while it is switching', async () => {
    let release!: () => void;
    switchBucket.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ status: 'switched', bucketName: 'typed-bucket' });
        })
    );
    renderSwitcher(unavailable);

    await open();
    type(screen.getByLabelText(/bucket name/i), 'typed-bucket');
    fireEvent.click(screen.getByRole('button', { name: /switch bucket/i }));
    fireEvent.click(screen.getByRole('button', { name: /switching/i }));

    expect(switchBucket).toHaveBeenCalledTimes(1);
    release();
  });
});

describe('when listing merely failed', () => {
  const retryable = (refresh: () => void) =>
    buckets({
      status: 'error',
      isDiscoveryUnavailable: false,
      refresh,
      error: {
        kind: 'network',
        title: 'Could not reach your storage',
        detail: 'The request never completed.',
        retryable: true,
        unavailable: false,
      },
    });

  it('offers to try again rather than a name field', async () => {
    const refresh = vi.fn();
    renderSwitcher(retryable(refresh));

    await open();

    // A dropped connection is not a missing permission, and sending someone to
    // type a bucket name would be the wrong instruction entirely.
    expect(screen.getByText(/could not reach your storage/i)).toBeDefined();
    expect(screen.queryByLabelText(/bucket name/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

/**
 * The keyboard path, which is the one an input inside a menu breaks.
 *
 * A menu owns its focus and acts on arrow keys only when it is the event's own
 * target, so both halves of this had to be arranged deliberately: the field is
 * given the opening focus, and the first arrow key hands the list a row to
 * start its own navigation from. Neither is visible in a click-driven test,
 * which is exactly why they are here.
 */
describe('driving the switcher from the keyboard', () => {
  it('puts the caret in the search field', async () => {
    renderSwitcher(buckets(READY));

    await open();

    // Taking focus back after the menu has placed it does not work - Radix
    // wins that race - and the failure is silent: every keystroke goes to the
    // menu's typeahead and jumps between rows instead of typing.
    expect(document.activeElement).toBe(screen.getByLabelText(/search buckets/i));
  });

  it('walks from the field into the list and selects with Enter', async () => {
    renderSwitcher(buckets(READY));

    await open();
    const field = screen.getByLabelText(/search buckets/i);

    fireEvent.keyDown(field, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).not.toBe(field));

    const first = document.activeElement as HTMLElement;
    expect(first.getAttribute('role')).toBe('menuitemradio');
    expect(first.textContent).toContain('my-production-bucket');

    // The second arrow is the menu's own roving focus: the bridge above only
    // has to get the keyboard into the list, not reimplement navigating it.
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    await waitFor(() =>
      expect((document.activeElement as HTMLElement).textContent).toContain('staging-assets')
    );

    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });

    await waitFor(() => expect(switchBucket).toHaveBeenCalledWith('staging-assets', 'eu-west-1'));
  });

  it('closes on Escape', async () => {
    renderSwitcher(buckets(READY));

    await open();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});

describe('the confirmation and the list beneath it', () => {
  it('takes the list out of reach while the question is up', async () => {
    switchBucket.mockResolvedValueOnce({
      status: 'blocked',
      activeWork: { uploads: 1, deletes: 0 },
    });
    renderSwitcher(buckets(READY));

    await open();
    pick(/staging-assets/);
    await screen.findByRole('alertdialog');

    // The menu is still mounted underneath - the dialog hides it from the
    // accessibility tree rather than closing it - so exactly one layer is
    // reachable and the question cannot be answered by clicking past it.
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('menuitemradio', { name: /backups/ })).toBeNull();
  });

  it('gives the list back, focused, when the question is declined', async () => {
    switchBucket.mockResolvedValueOnce({
      status: 'blocked',
      activeWork: { uploads: 1, deletes: 0 },
    });
    renderSwitcher(buckets(READY));

    await open();
    pick(/staging-assets/);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    // Declining puts the user back where they were rather than dumping them
    // on a closed navbar with nothing to show for the trip.
    expect(screen.getByRole('menu')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByLabelText(/search buckets/i));
  });

  it('does not carry a declined choice over to the next one', async () => {
    switchBucket.mockResolvedValueOnce({
      status: 'blocked',
      activeWork: { uploads: 1, deletes: 0 },
    });
    renderSwitcher(buckets(READY));

    await open();
    pick(/staging-assets/);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    pick(/backups/);

    // The bucket and region travel as arguments rather than as state, so an
    // abandoned choice cannot be applied to the next one.
    await waitFor(() => expect(switchBucket).toHaveBeenLastCalledWith('backups', undefined));
  });
});

describe('recovering from a failed switch', () => {
  it('stops looking busy and lets another bucket be chosen', async () => {
    switchBucket.mockRejectedValueOnce(
      Object.assign(new Error('NoSuchBucket'), {
        name: 'NoSuchBucket',
        $metadata: { httpStatusCode: 404 },
      })
    );
    renderSwitcher(buckets(READY));

    await open();
    pick(/staging-assets/);

    await waitFor(() => expect(notifyError).toHaveBeenCalled());

    // A spinner left spinning would say a switch is still happening when the
    // session has already settled back on the bucket it never left.
    const trigger = screen.getByRole('button', { name: /change bucket/i, hidden: true });
    expect(trigger.querySelector('.animate-spin')).toBeNull();

    switchBucket.mockResolvedValueOnce({ status: 'switched', bucketName: 'backups' });
    pick(/backups/);

    await waitFor(() => expect(switchBucket).toHaveBeenLastCalledWith('backups', undefined));
  });
});

describe('the two ways a form can be submitted', () => {
  const unavailable = () =>
    buckets({
      status: 'error',
      isDiscoveryUnavailable: true,
      error: {
        kind: 'permissions',
        title: 'These keys are not allowed to do that',
        detail: 'The key needs permission to list buckets.',
        retryable: false,
        unavailable: true,
      },
    });

  it('ignores Enter on an empty field, not just a disabled button', async () => {
    renderSwitcher(unavailable());

    await open();
    const field = screen.getByLabelText(/bucket name/i);
    type(field, '   ');
    fireEvent.submit(field.closest('form') as HTMLFormElement);

    // The greyed-out button is not the only guard: Enter submits the form
    // directly, and `switchBucket('')` would be a request for a bucket with
    // no name.
    expect(switchBucket).not.toHaveBeenCalled();
  });

  it('submits what was typed when Enter is pressed', async () => {
    renderSwitcher(unavailable());

    await open();
    const field = screen.getByLabelText(/bucket name/i);
    type(field, 'typed-bucket');
    fireEvent.submit(field.closest('form') as HTMLFormElement);

    await waitFor(() => expect(switchBucket).toHaveBeenCalledWith('typed-bucket', undefined));
  });
});

describe('typing in the search field is typing, not menu navigation', () => {
  it('keeps the caret where it is when a letter is pressed', async () => {
    renderSwitcher(buckets(READY));

    await open();
    const field = screen.getByLabelText(/search buckets/i);

    fireEvent.keyDown(field, { key: 'b' });

    // A menu answers a printable key by jumping to the row that starts with
    // it. Reaching the list, that keystroke would move focus to "backups"
    // instead of putting a "b" in the field.
    expect(document.activeElement).toBe(field);
  });
});
