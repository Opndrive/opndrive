/**
 * The connection name on the connect form.
 *
 * It is how a connection is listed in the switcher, so it is required: without
 * it the submit is blocked and the form says why, rather than inventing a name
 * the person never chose.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const createSession = vi.fn();
const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ createSession }),
}));

import { getProviderBySlug } from '@/config/providers';
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

beforeEach(() => {
  createSession.mockReset();
  createSession.mockResolvedValue(undefined);
  push.mockReset();
});

describe('the connection name field', () => {
  it('is required and not marked optional', () => {
    render(<ConnectWizard provider={wasabi} />);

    const field = screen.getByLabelText(/connection name/i) as HTMLInputElement;

    expect(field.required).toBe(true);
    expect(field.closest('div')!.textContent).not.toMatch(/optional/i);
  });

  it('blocks connecting until a name is given, and says so', () => {
    render(<ConnectWizard provider={wasabi} />);
    fillCredentials();

    const submit = screen.getByRole('button', { name: /connect to your s3 storage/i });

    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/give this connection a name/i)).toBeDefined();
  });

  it('does not accept a name that is only spaces', () => {
    render(<ConnectWizard provider={wasabi} />);
    fillCredentials();
    fill('connection-name', '   ');

    expect(
      (screen.getByRole('button', { name: /connect to your s3 storage/i }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it('connects under the name that was typed, then opens the dashboard', async () => {
    render(<ConnectWizard provider={wasabi} />);
    fillCredentials();
    fill('connection-name', 'Studio media');

    const submit = screen.getByRole('button', { name: /connect to your s3 storage/i });
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(submit);

    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(createSession.mock.calls[0]![1]).toEqual({
      name: 'Studio media',
      provider: 'wasabi',
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
  });
});
