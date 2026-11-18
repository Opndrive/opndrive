import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SetupGuide } from './setup-guide';
import { S3_PROVIDERS, getProviderBySlug } from '@/config/providers';
import { DOCS_URL } from '@/config/links';

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

  it.each(['minio', 'wasabi'])(
    'does not call CORS required where the default already allows every origin (%s)',
    (slug) => {
      const provider = S3_PROVIDERS.find((p) => p.id === slug)!;
      const { container } = render(<SetupGuide provider={provider} />);

      // Applying a policy there replaces an open default, shutting out every
      // other site that relied on it; the steps say when it is needed.
      expect(container.querySelector('details')?.hasAttribute('open')).toBe(true);
      expect(screen.getByText('Only if CORS is restricted')).toBeTruthy();
      expect(screen.queryByText('Required')).toBeNull();
    }
  );

  it('names its copy buttons by their visible text and says when something is copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<SetupGuide provider={getProviderBySlug('aws-s3')!} />);

    const button = screen.getByRole('button', { name: 'Copy policy' });
    expect(screen.getByRole('status').textContent).toBe('');

    fireEvent.click(button);

    expect(await screen.findByRole('button', { name: 'Copied policy' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('The policy is on your clipboard');
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"ExposeHeaders"'));
  });

  it.each(S3_PROVIDERS.map((provider) => [provider.name, provider] as const))(
    'fills the %s policy in with the address the page is open at',
    async (_name, provider) => {
      const { container } = render(<SetupGuide provider={provider} />);
      const origin = window.location.origin;

      // The effect that reads window.location runs after the first render.
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
