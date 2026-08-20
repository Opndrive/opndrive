/**
 * Hydration for the connect form.
 *
 * These pages exist to be indexed, so they server-render and then hydrate. Any
 * mismatch would mean a crawler and a browser see different markup, and the
 * form is where that risk lives: it is the only interactive part, and it holds
 * a combobox and a reveal toggle that both carry state.
 *
 * The rule they have to obey is the same one the privacy pages do. The first
 * client render must match the server's, and real values arrive afterwards.
 *
 * @vitest-environment-options { "url": "https://opndrive.app/connect/wasabi" }
 */

import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/connect/wasabi',
}));

vi.mock('@opndrive/s3-api', () => ({
  BYOS3ApiProvider: class {
    getS3Client() {
      return {};
    }
    getBucketName() {
      return 'test-bucket';
    }
  },
  UploadManager: { getInstance: () => ({}), disposeInstance: async () => {} },
  SignedUrlUploadManager: { getInstance: () => ({}), disposeInstance: async () => {} },
}));

import { AuthProvider } from '@/context/auth-context';
import { getProviderBySlug } from '@/config/providers';
import { getCorsConfig } from '@/config/cors';
import { ConnectWizard } from './connect-wizard';
import { SetupGuide } from './setup-guide';

const wasabi = getProviderBySlug('wasabi')!;

function tree() {
  return (
    <AuthProvider>
      <ConnectWizard provider={wasabi} />
      <SetupGuide provider={wasabi} corsConfig={getCorsConfig(wasabi.id)} />
    </AuthProvider>
  );
}

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

describe('server output', () => {
  it('renders the form rather than an auth placeholder', () => {
    const html = renderToString(tree());

    expect(html).not.toContain('Loading...');
    expect(html).toContain('Access key ID');
    expect(html).toContain('Connect to your S3 storage');
  });

  // The setup steps are the content that makes this page worth indexing, so
  // they have to be in the markup even though the disclosure starts closed.
  it('includes the setup guide content even while collapsed', () => {
    const html = renderToString(tree());

    expect(html).toContain('<details');
    expect(html).toContain(wasabi.setup.corsInstructions);
    expect(html).toContain('AllowedMethods');
  });

  it('starts the secret masked and the region list closed', () => {
    const html = renderToString(tree());

    expect(html).toContain('type="password"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('shows the provider default region', () => {
    const html = renderToString(tree());

    expect(html).toContain(wasabi.defaultRegion);
  });
});

describe('hydration', () => {
  it('hydrates without a mismatch', () => {
    container.innerHTML = renderToString(tree());

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    act(() => {
      hydrateRoot(container, tree());
    });

    const messages = errors.mock.calls.map((call) => String(call[0]));
    errors.mockRestore();

    expect(messages.filter((message) => /hydrat|did not match|server HTML/i.test(message))).toEqual(
      []
    );
  });

  it('leaves the form usable once hydrated', () => {
    container.innerHTML = renderToString(tree());

    act(() => {
      hydrateRoot(container, tree());
    });

    expect(container.querySelector('#access-key-id')).not.toBeNull();
    expect(container.querySelector('[role="combobox"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Reveal secret access key"]')).not.toBeNull();
  });
});

describe('the submit button', () => {
  it('starts disabled, with a reason, because the form is empty', () => {
    const html = renderToString(tree());

    expect(html).toContain('disabled');
    expect(html).toContain('Fill in the key, secret and bucket');
  });
});
