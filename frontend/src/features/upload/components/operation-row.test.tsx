/**
 * OperationRow.
 *
 * Here for the same reason QueueNotices is: the thing that went wrong was not
 * that the data was missing, but that it was computed and never displayed.
 *
 * A partly-failed delete builds a summary naming the objects that survived,
 * writes it to the store, and sets the operation's status to 'failed'. The row
 * only ever rendered a reason for status 'error' - which uploads and downloads
 * use and deletes never do - so every one of those summaries was thrown away at
 * the last step. Nothing in the store layer could catch that.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { OperationRow, type OperationRowProps } from './operation-row';

function props(overrides: Partial<OperationRowProps> = {}): OperationRowProps {
  return {
    id: 'op-1',
    name: 'report.pdf',
    type: 'file',
    operationType: 'delete',
    status: 'deleting',
    progress: 0,
    isHovered: false,
    supportsPauseResume: false,
    onHoverChange: vi.fn(),
    onCancel: vi.fn(),
    onRemove: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    ...overrides,
  };
}

describe('a delete that failed says why', () => {
  it('shows the reason a delete reports', () => {
    const summary =
      '2 of 8 object(s) could not be deleted. photos/locked.jpg - AccessDenied; photos/held.jpg - ObjectLockRetention';

    render(<OperationRow {...props({ status: 'failed', error: summary })} />);

    // The status a delete actually reports is 'failed'. Matching on 'error'
    // alone rendered nothing at all here.
    expect(screen.getByText(summary)).toBeTruthy();
  });

  it('says something even when no reason came back', () => {
    render(<OperationRow {...props({ status: 'failed' })} />);

    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('still shows an upload error, which uses the other status', () => {
    render(
      <OperationRow
        {...props({ operationType: 'upload', status: 'error', error: 'Network unreachable' })}
      />
    );

    expect(screen.getByText('Network unreachable')).toBeTruthy();
  });
});

describe('a delete that worked does not look like one that did not', () => {
  it('paints a finished delete the same as any other finished operation', () => {
    const { unmount } = render(
      <OperationRow {...props({ operationType: 'upload', status: 'completed' })} />
    );
    const finishedUpload = screen.getByText('Upload complete').getAttribute('style');
    unmount();

    render(<OperationRow {...props({ operationType: 'delete', status: 'completed' })} />);
    const finishedDelete = screen.getByText('Delete complete').getAttribute('style');

    // A finished delete used to be painted the same red as a cancelled or
    // failed one, so a green tick sat next to red text - and a real failure
    // was indistinguishable from a success at a glance.
    expect(finishedDelete).toBe(finishedUpload);
  });

  it('keeps a cancelled delete visually distinct from a finished one', () => {
    const { unmount } = render(<OperationRow {...props({ status: 'completed' })} />);
    const finished = screen.getByText('Delete complete').getAttribute('style');
    unmount();

    render(<OperationRow {...props({ status: 'cancelled' })} />);
    const cancelled = screen.getByText('Delete cancelled').getAttribute('style');

    expect(cancelled).not.toBe(finished);
  });
});

describe('a counted card shows what it counted', () => {
  const detail = 'a.json\nb.json\nc.json';

  it('offers the names behind an icon rather than on the card', () => {
    render(<OperationRow {...props({ name: '3 items', detail })} />);

    // Inline, eight names truncate to "main - Copy - Copy (2).json, mai..." -
    // a whole line spent saying less than the count above it already did.
    expect(screen.getByText('3 items')).toBeTruthy();
    expect(screen.queryByText(detail)).toBeNull();
    expect(screen.getByLabelText('Show all items')).toBeTruthy();
  });

  it('lists them when the icon is hovered', () => {
    vi.useFakeTimers();

    try {
      render(<OperationRow {...props({ name: '3 items', detail })} />);
      const trigger = screen.getByLabelText('Show all items').parentElement!;

      fireEvent.mouseEnter(trigger);
      act(() => {
        // The tooltip waits before appearing, so resting on a control is a
        // deliberate act rather than something that happens in passing.
        vi.advanceTimersByTime(700);
      });

      expect(screen.getByRole('tooltip').textContent).toBe(detail);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders the list with the breaks kept, not folded into a paragraph', () => {
    vi.useFakeTimers();

    try {
      render(<OperationRow {...props({ name: '3 items', detail })} />);
      fireEvent.mouseEnter(screen.getByLabelText('Show all items').parentElement!);
      act(() => {
        vi.advanceTimersByTime(700);
      });

      // `multiline` alone gives white-space: normal, which wraps but folds
      // newlines into spaces - a list of filenames as one run-on paragraph.
      expect(screen.getByRole('tooltip').className).toContain('aria-label-list');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows no icon when there is nothing behind it', () => {
    render(<OperationRow {...props({ name: 'report.pdf' })} />);

    expect(screen.queryByLabelText('Show all items')).toBeNull();
  });
});
