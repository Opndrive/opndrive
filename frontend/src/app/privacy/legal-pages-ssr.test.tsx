/**
 * The legal pages have to render through the real provider tree, not just on
 * their own.
 *
 * `legal-pages.test.tsx` renders them in isolation, which passes whether or not
 * anything above them is willing to show them. That gap hid a real problem:
 * AuthProvider replaces every child with a "Loading..." placeholder until it
 * has looked for a session, so the server was sending `<p>Loading...</p>` as
 * the entire body of the privacy policy. It only appeared once JavaScript ran.
 *
 * For a privacy policy that is not cosmetic. It has to be readable without
 * JavaScript and indexable by a crawler that does not run any.
 *
 * So these render through AuthProvider the way the app does, and assert the
 * content is really in the markup.
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

let mockPathname = '/privacy';

import { AuthProvider } from '@/context/auth-context';
import PrivacyPolicyPage from './page';
import TermsOfServicePage from '../terms/page';

function renderThroughProviders(pathname: string, page: React.ReactElement): string {
  mockPathname = pathname;

  return renderToStaticMarkup(<AuthProvider>{page}</AuthProvider>);
}

describe('privacy policy through the provider tree', () => {
  const html = renderThroughProviders('/privacy', <PrivacyPolicyPage />);

  it('is not replaced by the auth loading placeholder', () => {
    expect(html).not.toContain('Loading...');
  });

  it('renders the policy text into the markup', () => {
    expect(html).toContain('Privacy Policy');
    expect(html).toContain('What we do not collect');
  });

  it('renders the storage table a reader is meant to check', () => {
    expect(html).toContain('s3_user_session');
    expect(html).toContain('dashboard_sidebar_state');
  });

  it('renders the opt-out control', () => {
    expect(html).toContain('Anonymous usage analytics');
  });
});

describe('terms through the provider tree', () => {
  const html = renderThroughProviders('/terms', <TermsOfServicePage />);

  it('is not replaced by the auth loading placeholder', () => {
    expect(html).not.toContain('Loading...');
  });

  it('renders the terms text into the markup', () => {
    expect(html).toContain('Terms of Service');
    expect(html).toContain('AGPL-3.0');
  });
});

describe('every other route keeps the gate it had', () => {
  // The placeholder exists so the dashboard never renders without a session.
  // Only the legal pages are exempt, and only because nothing on them reads
  // auth state.
  it.each(['/dashboard', '/dashboard/search', '/connect', '/'])(
    'still shows the placeholder on %s',
    (pathname) => {
      const html = renderThroughProviders(pathname, <div>protected content</div>);

      expect(html).toContain('Loading...');
      expect(html).not.toContain('protected content');
    }
  );
});
