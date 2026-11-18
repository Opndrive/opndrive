/**
 * The connection name on the connect form, and connecting while another
 * account is live.
 *
 * The name is how a connection is listed in the switcher. It is optional: left
 * blank, the connection is called after its provider and bucket, and the form
 * shows that default before anything is submitted, so it is never a surprise.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const createSession = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ createSession }),
}));

import { getProviderBySlug } from '@/config/providers';
import { ConfirmDialogHost } from '@/shared/components/ui/confirm-dialog';
import { ConnectWizard } from './connect-wizard';

const wasabi = getProviderBySlug('wasabi')!;

/** By id: the secret field's reveal button also carries "secret access key" as a label. */
function fill(id: string, value: string) {
  fireEvent.change(document.getElementById(id)!, { target: { value } });
}

function fillCredentials() {
  fill('access-key-id', 'AKIA_TEST');
  fill('secret-access-key', 'secret');
  fill('bucket-name', 'my-bucket');
}

function renderWizard() {
  return render(
    <>
      <ConnectWizard provider={wasabi} />
      <ConfirmDialogHost />
    </>
  );
}

const submitButton = () =>
  screen.getByRole('button', { name: /connect to your s3 storage/i }) as HTMLButtonElement;

beforeEach(() => {
  createSession.mockReset();
  createSession.mockResolvedValue({ status: 'created', connectionId: 'new' });
  push.mockReset();
});

describe('the connection name field', () => {
  it('is optional, and says so', () => {
    renderWizard();

    const field = screen.getByLabelText(/connection name/i) as HTMLInputElement;

    expect(field.required).toBe(false);
    expect(screen.getByText(/connection name/i).textContent).toMatch(/optional/i);
  });

  it('shows the name a blank field becomes, and describes the field with it', () => {
    renderWizard();
    fillCredentials();

    const field = screen.getByLabelText(/connection name/i) as HTMLInputElement;
    const hint = document.getElementById(field.getAttribute('aria-describedby')!)!;

    expect(field.placeholder).toBe('Wasabi - my-bucket');
    expect(hint.textContent).toContain('Wasabi - my-bucket');
  });

  it('does not hold the submit back for a missing name', () => {
    renderWizard();
    fillCredentials();

    expect(submitButton().disabled).toBe(false);
  });

  it('connects under the name that was typed, then opens the dashboard', async () => {
    renderWizard();
    fillCredentials();
    fill('connection-name', 'Studio media');

    fireEvent.click(submitButton());

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(createSession.mock.calls[0]![1]).toEqual({ name: 'Studio media', provider: 'wasabi' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
  });

  it('leaves the naming to the default when the field is blank', async () => {
    renderWizard();
    fillCredentials();

    fireEvent.click(submitButton());

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(createSession.mock.calls[0]![1]).toEqual({ name: '', provider: 'wasabi' });
  });
});

describe('connecting while another account has work running', () => {
  beforeEach(() => {
    createSession
      .mockReset()
      .mockResolvedValueOnce({ status: 'blocked', activeWork: { uploads: 2, deletes: 1 } })
      .mockResolvedValueOnce({ status: 'created', connectionId: 'new' });
  });

  it('asks before cancelling it, and only connects once told to', async () => {
    renderWizard();
    fillCredentials();

    fireEvent.click(submitButton());

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/2 uploads and 1 delete are still in progress/i)).toBeDefined();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /connect and cancel/i }));

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(2));
    expect(createSession.mock.calls[1]![2]).toEqual({ discardActiveWork: true });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
  });

  it('stays on the form, with the work untouched, when the question is declined', async () => {
    renderWizard();
    fillCredentials();

    fireEvent.click(submitButton());

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(submitButton().disabled).toBe(false);
  });
});

it('does not open the dashboard when another change got there first', async () => {
  createSession.mockReset().mockResolvedValue({ status: 'busy' });
  renderWizard();
  fillCredentials();

  fireEvent.click(submitButton());

  await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(submitButton().disabled).toBe(false));
  expect(push).not.toHaveBeenCalled();
});
