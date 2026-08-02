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

import { describe, it, expect, beforeEach } from 'vitest';
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
        detail:
          'proj/node_modules/f0.js and 499 other item(s) in this folder could not be read (EACCES) and were not uploaded.',
      }),
    ]);

    render(<QueueNotices />);

    expect(screen.getByText(/499 other item\(s\)/)).toBeTruthy();
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

  it('counts a single notice in the singular', () => {
    seed([notice()]);

    render(<QueueNotices />);

    expect(screen.getByText('1 notice')).toBeTruthy();
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
