import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SetupGuide } from './setup-guide';
import { S3_PROVIDERS, getProviderBySlug } from '@/config/providers';
import { DOCS_URL } from '@/config/links';

/** Puts a fake clipboard on navigator for one test; afterEach takes it away. */
function fakeClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

afterEach(() => {
  // jsdom has no clipboard of its own; leave none behind for the next test.
  delete (navigator as { clipboard?: unknown }).clipboard;
  vi.useRealTimers();
});

describe('SetupGuide', () => {
  it.each(S3_PROVIDERS.map((provider) => [provider.name, provider] as const))(
    'tells %s users how to clean up interrupted uploads',
    (_name, provider) => {
      render(<SetupGuide provider={provider} />);

      // A closed tab leaves multipart parts behind that no listing shows and
      // the browser can never come back for. Only a bucket rule removes them.
      const link = screen.getByRole('link', { name: 'How to add the rule' });
      expect(link.getAttribute('href')).toBe(
        `${DOCS_URL}/guides/uploading-files#required-clean-up-incomplete-multipart-uploads`
      );
    }
  );

  it.each(S3_PROVIDERS.filter((p) => p.setup.corsRequired).map((p) => [p.name, p] as const))(
    'shows the %s steps open and marked required',
    (_name, provider) => {
      const { container } = render(<SetupGuide provider={provider} />);

      // Without the CORS policy nothing works, so the steps are not tucked away.
      expect(container.querySelector('details')?.hasAttribute('open')).toBe(true);
      expect(screen.getByText('Required')).toBeTruthy();
      expect(screen.queryByText('Optional')).toBeNull();
    }
  );

  it.each(S3_PROVIDERS.filter((p) => !p.setup.corsRequired).map((p) => [p.name, p] as const))(
    'does not call CORS required where the default already allows every origin (%s)',
    (_name, provider) => {
      const { container } = render(<SetupGuide provider={provider} />);

      // Applying a policy there replaces an open default, shutting out every
      // other site that relied on it; the steps say when it is needed.
      expect(container.querySelector('details')?.hasAttribute('open')).toBe(true);
      expect(screen.getByText('Only if CORS is restricted')).toBeTruthy();
      expect(screen.queryByText('Required')).toBeNull();
    }
  );

  it('keeps its copy button named by its visible text and says the copy worked', async () => {
    vi.useFakeTimers();
    const writeText = fakeClipboard();
    render(<SetupGuide provider={getProviderBySlug('aws-s3')!} />);
    const status = () => screen.getAllByRole('status')[0]!.textContent;

    expect(status()).toBe('');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy policy' }));
    });
    await act(async () => {
      vi.advanceTimersByTime(60);
    });

    expect(status()).toBe('Copied the policy');
    // The name does not change under focus; the status region says the result.
    expect(screen.getByRole('button', { name: 'Copy policy' })).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"ExposeHeaders"'));

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(status()).toBe('');
  });

  it('announces a second copy too, and keeps "Copied" up for the full time after it', async () => {
    vi.useFakeTimers();
    fakeClipboard();
    render(<SetupGuide provider={getProviderBySlug('aws-s3')!} />);
    const status = () => screen.getAllByRole('status')[0]!.textContent;
    const click = () =>
      act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy policy' }));
      });

    await click();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await click();
    // Emptied straight away, so a screen reader hears the copy again...
    expect(status()).toBe('');
    await act(async () => {
      vi.advanceTimersByTime(60);
    });
    expect(status()).toBe('Copied the policy');
    // ...and the first copy's timer no longer clears it early.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(status()).toBe('Copied the policy');
  });

  it('leaves no timer running once the guide is gone', async () => {
    vi.useFakeTimers();
    fakeClipboard();
    const { unmount } = render(<SetupGuide provider={getProviderBySlug('aws-s3')!} />);
    // Something outside the guide keeps a timer of its own; count from there.
    const before = vi.getTimerCount();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy policy' }));
    });
    expect(vi.getTimerCount()).toBe(before + 2);
    unmount();

    expect(vi.getTimerCount()).toBe(before);
  });

  it.each(S3_PROVIDERS.map((provider) => [provider.name, provider] as const))(
    'fills the %s policy in with the address the page is open at',
    async (_name, provider) => {
      const { container } = render(<SetupGuide provider={provider} />);
      const origin = window.location.origin;

      // A client-only render reads window.location at once; hydration swaps it
      // in after the server's SITE_URL (connect-hydration.test.tsx).
      expect(await screen.findByText(origin, { selector: 'code' })).toBeTruthy();
      const policy = container.querySelector('pre code')?.textContent ?? '';
      expect(policy).toContain(origin);
      expect(policy).not.toContain('your-domain.com');
    }
  );

  it('asks for a pasted policy where the console takes one', () => {
    render(<SetupGuide provider={getProviderBySlug('aws-s3')!} />);
    expect(screen.getByText('2. Paste this policy')).toBeTruthy();
  });

  it('gives Backblaze a file and the command that applies it', () => {
    const { container } = render(<SetupGuide provider={getProviderBySlug('backblaze-b2')!} />);

    expect(screen.getByText('2. Save this as cors.json')).toBeTruthy();
    const snippets = [...container.querySelectorAll('pre code')].map((el) => el.textContent);
    expect(snippets).toHaveLength(2);
    expect(snippets[1]).toContain('aws s3api put-bucket-cors');
    expect(screen.getByRole('button', { name: 'Copy command' })).toBeTruthy();
  });

  it('gives MinIO a command to run', () => {
    render(<SetupGuide provider={getProviderBySlug('minio')!} />);
    expect(screen.getByText('2. Run this command')).toBeTruthy();
  });
});
