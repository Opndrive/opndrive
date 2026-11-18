/**
 * The blog has to reach the server's HTML, not just the browser.
 *
 * AuthProvider replaces its children with a "Loading..." placeholder until it
 * has looked for a session, except on the public routes. /blog was not one of
 * them, so the blog index and every post were served as "Loading..." with the
 * article text only in the client payload - which is what a crawler indexes.
 *
 * The blog pages are async server components and cannot be rendered here
 * directly, so a stand-in child goes through the same gate they do. What is
 * under test is the gate.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => mockPathname,
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

let mockPathname = '/blog';

import { AuthProvider } from '@/context/auth-context';

const ARTICLE = 'The body of a blog post, which a crawler has to see.';

function renderAt(pathname: string): string {
  mockPathname = pathname;
  return renderToStaticMarkup(
    <AuthProvider>
      <article>{ARTICLE}</article>
    </AuthProvider>
  );
}

describe('blog pages through the provider tree', () => {
  it.each(['/blog', '/blog/configure-cors-for-r2'])(
    '%s renders its content on the server',
    (path) => {
      const html = renderAt(path);

      expect(html).not.toContain('Loading...');
      expect(html).toContain(ARTICLE);
    }
  );

  it('still gates the dashboard, which is useless without a session', () => {
    const html = renderAt('/dashboard');

    expect(html).toContain('Loading...');
    expect(html).not.toContain(ARTICLE);
  });

  it('does not make look-alike paths public', () => {
    expect(renderAt('/blogroll')).toContain('Loading...');
  });
});
