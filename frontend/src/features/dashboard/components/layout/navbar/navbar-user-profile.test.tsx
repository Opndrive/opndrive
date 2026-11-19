/**
 * Clear Session in the profile menu.
 *
 * It signs this browser out of every saved connection, keys included. With one
 * connection that is what anyone expects of it; with several, it says so first,
 * because the others go too.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import NavbarUserProfile from './navbar-user-profile';
import { ConfirmDialogHost } from '@/shared/components/ui/confirm-dialog';

const clearSession = vi.fn();
const authState = vi.fn();

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authState(),
}));

vi.mock('@/shared/components/layout/ThemeToggle', () => ({
  ThemeToggle: () => <div />,
}));

function withConnections(count: number) {
  authState.mockReturnValue({
    clearSession,
    connections: Array.from({ length: count }, (_, i) => ({
      id: `c${i}`,
      name: `Connection ${i}`,
    })),
  });
}

function renderProfile() {
  return render(
    <>
      <NavbarUserProfile />
      <ConfirmDialogHost />
    </>
  );
}

/** Radix opens a menu on pointerdown rather than click, so both are fired. */
async function chooseClearSession() {
  const trigger = screen.getByRole('button', { name: 'Account menu' });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('menuitem', { name: /clear session/i }));
}

beforeEach(() => {
  clearSession.mockReset();
  authState.mockReset();
});

describe('Clear Session', () => {
  it('signs out straight away when there is only the one connection', async () => {
    withConnections(1);
    renderProfile();

    await chooseClearSession();

    await waitFor(() => expect(clearSession).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('says every saved connection goes, before signing out of several', async () => {
    withConnections(3);
    renderProfile();

    await chooseClearSession();

    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(/removes all 3 saved connections and their keys/i)
    ).toBeDefined();
    expect(
      within(dialog).getByText(/your buckets and the files in them are not touched/i)
    ).toBeDefined();
    expect(clearSession).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /^clear session$/i }));

    await waitFor(() => expect(clearSession).toHaveBeenCalledTimes(1));
  });

  it('keeps everything when the question is declined', async () => {
    withConnections(2);
    renderProfile();

    await chooseClearSession();

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(clearSession).not.toHaveBeenCalled();
  });
});
