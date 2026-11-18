/**
 * The navbar connection switcher.
 *
 * A view over `useAuth()`: the list, which connection is live, and the
 * switch / remove calls all come from there and are mocked, so these tests are
 * about what a person sees and what the component asks for - which connection,
 * whether it asked before discarding work, and whether it confirmed before a
 * delete - rather than about the session lifecycle, which the auth-context
 * suite covers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Credentials } from '@opndrive/s3-api';
import { ConnectionSwitcher } from './connection-switcher';
import { ConfirmDialogHost } from '@/shared/components/ui/confirm-dialog';
import type { Connection } from '@/lib/connections/connections';

const switchConnection = vi.fn();
const removeConnection = vi.fn();
const notifyError = vi.fn();
const notifySuccess = vi.fn();
const push = vi.fn();
const authState = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authState(),
}));

vi.mock('@/context/notification-context', () => ({
  useNotification: () => ({
    error: notifyError,
    success: notifySuccess,
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

const ACCOUNT_A: Credentials = {
  accessKeyId: 'AKIA_A',
  secretAccessKey: 'secret-a',
  region: 'us-east-1',
  bucketName: 'bucket-a',
  prefix: '',
};

const ACCOUNT_B: Credentials = {
  accessKeyId: 'R2_B',
  secretAccessKey: 'secret-b',
  region: 'auto',
  bucketName: 'media',
  prefix: '',
  endpoint: 'https://abc.r2.cloudflarestorage.com',
};

const LONG_NAME = 'A connection name that goes on and on far past any sensible width for a menu';

const CONNECTIONS: Connection[] = [
  { id: 'a', name: 'Personal', provider: 'aws-s3', authContext: ACCOUNT_A },
  { id: 'b', name: LONG_NAME, provider: 'cloudflare-r2', authContext: ACCOUNT_B },
];

function signedInAs(activeId: string | null, connections: Connection[] = CONNECTIONS) {
  authState.mockReturnValue({
    connections,
    activeConnectionId: activeId,
    switchConnection,
    removeConnection,
  });
}

function renderSwitcher() {
  return render(
    <>
      <ConnectionSwitcher />
      <ConfirmDialogHost />
    </>
  );
}

/** Radix opens a menu on pointerdown rather than click, so both are fired. */
async function open() {
  const trigger =
    screen.queryByRole('button', { name: /change connection/i }) ??
    screen.getByRole('button', { name: /change connection/i, hidden: true });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
  await screen.findByRole('menu');
}

beforeEach(() => {
  switchConnection.mockReset();
  switchConnection.mockResolvedValue({ status: 'switched', connectionId: 'b' });
  removeConnection.mockReset();
  notifyError.mockReset();
  notifySuccess.mockReset();
  push.mockReset();
  authState.mockReset();
  signedInAs('a');
});

describe('the closed control', () => {
  it('names the connection in use, with its provider mark', () => {
    renderSwitcher();

    const trigger = screen.getByRole('button', { name: /change connection/i });

    expect(within(trigger).getByText('Personal')).toBeDefined();
    expect(trigger.querySelector('svg')).not.toBeNull();
    expect(trigger.getAttribute('aria-label')).toContain('Personal');
  });

  it('keeps the whole of a long name reachable and truncates the visible text', () => {
    signedInAs('b');
    renderSwitcher();

    const trigger = screen.getByRole('button', { name: /change connection/i });

    expect(trigger.getAttribute('title')).toBe(LONG_NAME);
    expect(within(trigger).getByText(LONG_NAME).className).toContain('truncate');
  });

  it('says so when no connection is live', () => {
    signedInAs(null, []);
    renderSwitcher();

    expect(screen.getByRole('button', { name: /no connection/i })).toBeDefined();
  });
});

describe('the list', () => {
  it('shows every saved connection with its provider', async () => {
    renderSwitcher();
    await open();

    expect(screen.getByRole('menuitemradio', { name: /personal/i })).toBeDefined();
    expect(
      screen.getByRole('menuitemradio', { name: new RegExp(LONG_NAME.slice(0, 20)) })
    ).toBeDefined();
    expect(screen.getByText('Amazon S3')).toBeDefined();
    expect(screen.getByText('Cloudflare R2')).toBeDefined();
  });

  it('ellipsises a long name in its row and keeps it in the tooltip', async () => {
    renderSwitcher();
    await open();

    const row = screen.getByRole('menuitemradio', { name: new RegExp(LONG_NAME.slice(0, 20)) });

    expect(row.getAttribute('title')).toBe(LONG_NAME);
    expect(within(row).getByText(LONG_NAME).className).toContain('truncate');
  });

  it('marks the connection in use and offers no delete for it', async () => {
    renderSwitcher();
    await open();

    expect(
      screen.getByRole('menuitemradio', { name: /personal/i }).getAttribute('aria-checked')
    ).toBe('true');
    expect(screen.queryByRole('menuitem', { name: /delete connection personal/i })).toBeNull();
    expect(
      screen.getByRole('menuitem', { name: /delete connection a connection name/i })
    ).toBeDefined();
  });

  it('says so when there are none', async () => {
    signedInAs(null, []);
    renderSwitcher();
    await open();

    expect(screen.getByText(/no connections yet/i)).toBeDefined();
  });
});

describe('switching', () => {
  it('asks for the connection picked and closes once it has switched', async () => {
    renderSwitcher();
    await open();

    fireEvent.click(
      screen.getByRole('menuitemradio', { name: new RegExp(LONG_NAME.slice(0, 20)) })
    );

    await waitFor(() => expect(switchConnection).toHaveBeenCalledWith('b'));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('does not switch to the connection already in use', async () => {
    renderSwitcher();
    await open();

    fireEvent.click(screen.getByRole('menuitemradio', { name: /personal/i }));

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(switchConnection).not.toHaveBeenCalled();
  });

  it('reports a connection that could not be reached and stays open', async () => {
    switchConnection.mockRejectedValue(
      Object.assign(new Error('AccessDenied'), {
        name: 'ConnectionFailureError',
        failure: { kind: 'permissions', title: 'Access denied', detail: 'Check the key.' },
      })
    );
    renderSwitcher();
    await open();

    fireEvent.click(
      screen.getByRole('menuitemradio', { name: new RegExp(LONG_NAME.slice(0, 20)) })
    );

    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('menu')).toBeDefined();
  });

  it('asks before cancelling work, and only discards it once told to', async () => {
    switchConnection
      .mockResolvedValueOnce({ status: 'blocked', activeWork: { uploads: 2, deletes: 0 } })
      .mockResolvedValueOnce({ status: 'switched', connectionId: 'b' });
    renderSwitcher();
    await open();

    fireEvent.click(
      screen.getByRole('menuitemradio', { name: new RegExp(LONG_NAME.slice(0, 20)) })
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/2 uploads are still in progress/i)).toBeDefined();
    expect(switchConnection).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog).getByRole('button', { name: /switch and cancel/i }));

    await waitFor(() => expect(switchConnection).toHaveBeenCalledTimes(2));
    expect(switchConnection).toHaveBeenLastCalledWith('b', { discardActiveWork: true });
  });

  it('leaves the work alone when the question is declined', async () => {
    switchConnection.mockResolvedValue({
      status: 'blocked',
      activeWork: { uploads: 1, deletes: 0 },
    });
    renderSwitcher();
    await open();

    fireEvent.click(
      screen.getByRole('menuitemradio', { name: new RegExp(LONG_NAME.slice(0, 20)) })
    );

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(switchConnection).toHaveBeenCalledTimes(1);
  });
});

describe('deleting', () => {
  const deleteButton = () =>
    screen.getByRole('menuitem', { name: /delete connection a connection name/i });

  it('confirms before removing anything', async () => {
    renderSwitcher();
    await open();

    fireEvent.click(deleteButton());

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/this removes the saved connection/i)).toBeDefined();
    expect(removeConnection).not.toHaveBeenCalled();
  });

  it('removes it once confirmed', async () => {
    renderSwitcher();
    await open();

    fireEvent.click(deleteButton());
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /delete connection$/i }));

    await waitFor(() => expect(removeConnection).toHaveBeenCalledWith('b'));
    expect(notifySuccess).toHaveBeenCalled();
  });

  it('keeps it when the confirmation is declined', async () => {
    renderSwitcher();
    await open();

    fireEvent.click(deleteButton());
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(removeConnection).not.toHaveBeenCalled();
  });
});

describe('adding', () => {
  it('sends the user to the connect page', async () => {
    renderSwitcher();
    await open();

    fireEvent.click(screen.getByRole('menuitem', { name: /add connection/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/connect'));
  });
});
