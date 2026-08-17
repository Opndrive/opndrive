/**
 * The confirm dialog replaced `window.confirm`, which was synchronous and could
 * only ever answer true or false.
 *
 * The risk in swapping that for a promise is a caller left waiting forever, or
 * worse, one that resolves true when the user never said yes. So these pin the
 * answer for every way the dialog can close, including the ones the user did
 * not initiate.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { ConfirmDialogHost, confirmAction } from './confirm-dialog';

const options = {
  title: 'Delete forever?',
  description: '"report.pdf" will be deleted forever.',
  confirmLabel: 'Delete forever',
  destructive: true,
};

/**
 * Starts a confirm and hands back the still-pending promise.
 *
 * Wrapped in an object deliberately: returning the promise itself from an async
 * function flattens it, so `await ask()` would block until the user answered -
 * which is the thing every test here is about to go and do.
 */
async function ask(): Promise<{ answer: Promise<boolean> }> {
  let answer!: Promise<boolean>;
  await act(async () => {
    answer = confirmAction(options);
  });
  await screen.findByRole('alertdialog');
  return { answer };
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('confirmAction', () => {
  it('shows what is about to happen', async () => {
    render(<ConfirmDialogHost />);
    const { answer } = await ask();

    expect(screen.getByText('Delete forever?')).toBeDefined();
    expect(screen.getByText('"report.pdf" will be deleted forever.')).toBeDefined();

    // Leave nothing pending behind this test.
    await click('Cancel');
    await answer;
  });

  it('resolves true when the user confirms', async () => {
    render(<ConfirmDialogHost />);
    const { answer } = await ask();

    await click('Delete forever');

    expect(await answer).toBe(true);
  });

  it('resolves false when the user cancels', async () => {
    render(<ConfirmDialogHost />);
    const { answer } = await ask();

    await click('Cancel');

    expect(await answer).toBe(false);
  });

  it('resolves false on Escape', async () => {
    render(<ConfirmDialogHost />);
    const { answer } = await ask();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(await answer).toBe(false);
  });

  it('resolves false rather than hanging if the host goes away mid-question', async () => {
    const { unmount } = render(<ConfirmDialogHost />);
    const { answer } = await ask();

    await act(async () => {
      unmount();
    });

    // A caller awaiting this would otherwise sit there forever, and the delete
    // it guards would never run and never report.
    expect(await answer).toBe(false);
  });

  it('declines instead of throwing when no host is mounted', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Nothing rendered at all - the case where this gets called from a tree
    // that does not sit under the root layout.
    expect(await confirmAction(options)).toBe(false);
    expect(error).toHaveBeenCalled();
  });

  it('closes again after answering, so the next call gets a fresh dialog', async () => {
    render(<ConfirmDialogHost />);
    const { answer: first } = await ask();

    await click('Delete forever');
    expect(await first).toBe(true);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

    const { answer: second } = await ask();
    await click('Cancel');
    expect(await second).toBe(false);
  });
});
