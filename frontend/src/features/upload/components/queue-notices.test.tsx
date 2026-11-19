/**
 * QueueNotices.
 *
 * The first component test in the codebase, and it earns that because the
 * notices were the one part of the pipeline nothing rendered: extraction losses
 * were collected, grouped, capped, and then dropped on the floor. A store test
 * cannot catch "computed but never displayed".
 *
 * Assertions go through the rendered text a user actually reads rather than
 * through props, so a change that keeps the data flowing but stops showing it
 * still fails.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { Profiler } from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { QueueNotices } from './queue-notices';
import { useUploadQueueStore, type QueueNotice } from '../stores/use-upload-queue-store';

const queue = () => useUploadQueueStore.getState();

function notice(overrides: Partial<QueueNotice> = {}): QueueNotice {
  return {
    id: `n-${Math.random()}`,
    kind: 'skipped',
    path: 'photos/a.jpg',
    detail: 'File "photos/a.jpg" could not be read and was not uploaded.',
    count: 1,
    ...overrides,
  };
}

function seed(notices: QueueNotice[]) {
  useUploadQueueStore.setState({ notices });
}

beforeEach(() => {
  seed([]);
});

describe('empty state', () => {
  it('renders nothing when there are no notices', () => {
    render(<QueueNotices />);

    expect(screen.queryByTestId('queue-notices')).toBeNull();
  });
});

describe('the three kinds', () => {
  it('shows a collision rename in the words the store produced', () => {
    seed([
      notice({
        kind: 'renamed',
        path: 'photos',
        detail:
          'A folder named "photos" was already here, so this one is being uploaded as "photos (1)".',
      }),
    ]);

    render(<QueueNotices />);

    expect(
      screen.getByText(
        'A folder named "photos" was already here, so this one is being uploaded as "photos (1)".'
      )
    ).toBeTruthy();
    expect(screen.getByTestId('queue-notice').getAttribute('data-kind')).toBe('renamed');
    expect(screen.getByText('Renamed')).toBeTruthy();
  });

  it('shows an aggregated skip summary with its real item count', () => {
    // The flood case: 500 permission errors collapse to one notice, and the
    // count is the thing that tells the user how much is missing.
    seed([
      notice({
        kind: 'skipped',
        path: 'proj/node_modules/',
        count: 500,
        detail: '500 items could not be read (EACCES) and were not uploaded.',
      }),
    ]);

    render(<QueueNotices />);

    expect(screen.getByText(/500 items could not be read/)).toBeTruthy();
    expect(screen.getByText('500 items')).toBeTruthy();
  });

  it('shows an unverified folder as a warning, not a rename', () => {
    // The only kind that can still lose data: the folder is uploading under a
    // name we could not check, so a matching object may be overwritten.
    seed([
      notice({
        kind: 'unverified',
        path: 'photos',
        detail:
          'Could not check whether "photos" already exists here, so it is being uploaded under that name. If it does exist, files with matching names will be overwritten.',
      }),
    ]);

    render(<QueueNotices />);

    const row = screen.getByTestId('queue-notice');
    expect(row.getAttribute('data-kind')).toBe('unverified');
    expect(within(row).getByText('Not verified')).toBeTruthy();
    expect(screen.getByText(/will be overwritten/)).toBeTruthy();

    // The label and its dismiss button on top, the detail across the full
    // width below. Beside the label, the detail was a narrow column of five
    // or six short lines.
    const header = within(row).getByTestId('queue-notice-header');
    expect(within(header).getByText('Not verified')).toBeTruthy();
    expect(within(header).getByRole('button', { name: /^Dismiss notice/ })).toBeTruthy();
    expect(header.contains(screen.getByText(/will be overwritten/))).toBe(false);

    // On the warning tint, not the neutral one a skip gets.
    expect(row.style.background).toBe('var(--warning-surface)');
  });

  it('gives each kind its own tint', () => {
    seed([
      notice({ id: 'a', kind: 'renamed', detail: 'renamed one' }),
      notice({ id: 'b', kind: 'skipped', detail: 'skipped one' }),
      notice({ id: 'c', kind: 'replaced', detail: 'replaced one' }),
      notice({ id: 'd', kind: 'unverified', detail: 'unverified one' }),
    ]);

    render(<QueueNotices />);

    const surfaces = Object.fromEntries(
      screen
        .getAllByTestId('queue-notice')
        .map((row) => [row.getAttribute('data-kind'), row.style.background])
    );
    expect(surfaces).toEqual({
      renamed: 'var(--info-surface)',
      skipped: 'var(--surface-sunken)',
      replaced: 'var(--warning-surface)',
      unverified: 'var(--warning-surface)',
    });
  });

  it('omits the item count for a notice standing for one thing', () => {
    seed([notice({ count: 1 })]);

    render(<QueueNotices />);

    expect(screen.queryByText(/^\d+ items$/)).toBeNull();
  });

  it('renders every notice in the list', () => {
    seed([
      notice({ id: 'a', kind: 'renamed', detail: 'renamed one' }),
      notice({ id: 'b', kind: 'skipped', detail: 'skipped one' }),
      notice({ id: 'c', kind: 'unverified', detail: 'unverified one' }),
    ]);

    render(<QueueNotices />);

    expect(screen.getAllByTestId('queue-notice')).toHaveLength(3);
    expect(screen.getByText('3 notices')).toBeTruthy();
  });

  it('leaves out the count and Clear all over a single notice', () => {
    // Over one notice they are a whole row repeating its own dismiss button.
    seed([notice()]);

    render(<QueueNotices />);

    expect(screen.getByTestId('queue-notice')).toBeTruthy();
    expect(screen.queryByText(/^\d+ notices?$/)).toBeNull();
    expect(screen.queryByText('Clear all')).toBeNull();
  });
});

describe('dismissing', () => {
  it('removes one notice from the store and the panel', () => {
    seed([
      notice({ id: 'a', detail: 'first problem' }),
      notice({ id: 'b', detail: 'second problem' }),
    ]);
    render(<QueueNotices />);

    fireEvent.click(screen.getByLabelText('Dismiss notice: first problem'));

    expect(queue().notices.map((n) => n.id)).toEqual(['b']);
    expect(screen.queryByText('first problem')).toBeNull();
    expect(screen.getByText('second problem')).toBeTruthy();
  });

  it('clears them all', () => {
    seed([notice({ id: 'a' }), notice({ id: 'b' }), notice({ id: 'c' })]);
    render(<QueueNotices />);

    fireEvent.click(screen.getByText('Clear all'));

    expect(queue().notices).toEqual([]);
    expect(screen.queryByTestId('queue-notices')).toBeNull();
  });

  it('disappears once the last notice is dismissed', () => {
    seed([notice({ id: 'only', detail: 'the only problem' })]);
    render(<QueueNotices />);

    fireEvent.click(screen.getByLabelText('Dismiss notice: the only problem'));

    expect(screen.queryByTestId('queue-notices')).toBeNull();
  });
});

describe('live updates', () => {
  it('appears when a drop produces notices while mounted', () => {
    render(<QueueNotices />);
    expect(screen.queryByTestId('queue-notices')).toBeNull();

    // What planDrop does at the end of a drop.
    act(() => {
      useUploadQueueStore.setState({ notices: [notice({ detail: 'something went wrong' })] });
    });

    expect(screen.getByText('something went wrong')).toBeTruthy();
  });
});

describe('render isolation', () => {
  /**
   * Counts commits caused by STORE changes.
   *
   * Deliberately not used to measure a parent re-render: `onRender` fires
   * whenever the Profiler element itself is re-rendered, so it reports a commit
   * even when the memoised child bails out, and would prove nothing there.
   * Store-driven re-renders are different - zustand only re-renders a
   * subscriber whose selected slice changed, so a commit here really does mean
   * the selector let something through.
   */
  function renderCounted() {
    let commits = 0;
    render(
      <Profiler id="notices" onRender={() => (commits += 1)}>
        <QueueNotices />
      </Profiler>
    );
    return () => commits;
  }

  it('is memoised, so the panel re-rendering cannot reach it', () => {
    // The operations panel re-renders on every progress tick. This component
    // takes no props, so memo is what stops those ticks here. Asserting the DOM
    // node is unchanged would prove nothing - React reuses nodes across
    // re-renders - so the wrapper itself is what gets checked.
    expect((QueueNotices as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.memo')
    );
  });

  it('does not re-render when unrelated queue state changes', () => {
    // isPlanning flips twice per drop, and claims churn throughout. Neither is
    // in this component's selector, so neither may reach it.
    seed([notice({ id: 'a', detail: 'stable notice' })]);
    const commits = renderCounted();
    const initial = commits();

    act(() => {
      useUploadQueueStore.setState({ isPlanning: true });
      useUploadQueueStore.getState().reservePrefix('photos', '', 'task-1');
    });

    expect(commits()).toBe(initial);
  });

  it('does re-render when the notices themselves change', () => {
    // Negative control for the two above: if the selector were broken in the
    // other direction, they would pass and this would fail.
    seed([notice({ id: 'a', detail: 'stable notice' })]);
    const commits = renderCounted();
    const initial = commits();

    act(() => {
      useUploadQueueStore.setState({ notices: [notice({ id: 'b', detail: 'new notice' })] });
    });

    expect(commits()).toBeGreaterThan(initial);
    expect(screen.getByText('new notice')).toBeTruthy();
  });
});

describe('the list behind a skipped notice', () => {
  const items = [
    { path: 'backup/may/a.jpg', kind: 'file' as const },
    { path: 'backup/may/b.jpg', kind: 'file' as const },
    { path: 'backup/june/locked', kind: 'folder' as const },
  ];

  function seedList(count = items.length, list = items) {
    seed([
      notice({
        path: 'backup/',
        count,
        detail: `${count} items could not be read and were not uploaded.`,
        items: list,
      }),
    ]);
  }

  it('is closed until asked for, so the notice is one line however many files', () => {
    seedList();
    render(<QueueNotices />);

    const toggle = screen.getByRole('button', { name: 'Show files' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('a.jpg')).toBeNull();
  });

  it('opens grouped by folder, with how many in each', () => {
    seedList();
    render(<QueueNotices />);

    fireEvent.click(screen.getByRole('button', { name: 'Show files' }));

    expect(screen.getByRole('button', { name: 'Hide files' }).getAttribute('aria-expanded')).toBe(
      'true'
    );
    expect(screen.getByText('backup/may/')).toBeTruthy();
    expect(screen.getByText('a.jpg')).toBeTruthy();
    expect(screen.getByText('b.jpg')).toBeTruthy();
    expect(screen.getByText('backup/june/')).toBeTruthy();
    expect(screen.getByText('locked/')).toBeTruthy();
  });

  it('says how many it is not showing when the notice kept fewer than it stands for', () => {
    seedList(10);
    render(<QueueNotices />);

    fireEvent.click(screen.getByRole('button', { name: 'Show files' }));

    expect(screen.getByText(/7 more not shown/)).toBeTruthy();
  });

  it('renders at most 300 names, and points to the copied list for the rest', () => {
    const many = Array.from({ length: 450 }, (_, i) => ({
      path: `big/f${i}.txt`,
      kind: 'file' as const,
    }));
    seedList(450, many);
    render(<QueueNotices />);

    fireEvent.click(screen.getByRole('button', { name: 'Show files' }));

    expect(screen.getByText('f299.txt')).toBeTruthy();
    expect(screen.queryByText('f300.txt')).toBeNull();
    expect(screen.getByText(/150 more not shown\. Copy the list to see them all/)).toBeTruthy();
  });

  it('copies every path, one a line', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    seedList();
    render(<QueueNotices />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy list' }));
    });

    expect(writeText).toHaveBeenCalledWith(
      'backup/may/a.jpg\nbackup/may/b.jpg\nbackup/june/locked/'
    );
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('says so when the clipboard is not available', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    seedList();
    render(<QueueNotices />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy list' }));
    });

    expect(screen.getByRole('button', { name: 'Could not copy' })).toBeTruthy();
  });

  it('has no list for a notice about a single file', () => {
    seed([notice()]);
    render(<QueueNotices />);

    expect(screen.queryByRole('button', { name: 'Show files' })).toBeNull();
  });
});
