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
import LandingPage from '../page';

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

// /connect is a landing page we want ranked, so it has to server-render like
// the legal pages do. Its provider children matter just as much, since those
// are the pages carrying the high-intent keywords.
describe('connect pages render for crawlers', () => {
  it.each(['/connect', '/connect/cloudflare-r2', '/connect/minio', '/connect/aws-s3'])(
    'renders real content on %s',
    (pathname) => {
      const html = renderThroughProviders(pathname, <div>connect content</div>);

      expect(html).not.toContain('Loading...');
      expect(html).toContain('connect content');
    }
  );
});

// The landing page is the pitch - hero, features, FAQ - and was the one public
// page still gated. It sat in the list below, grouped with the dashboard as if
// it were something to protect.
describe('the landing page renders for crawlers', () => {
  const html = renderThroughProviders('/', <LandingPage />);

  it('is not replaced by the auth loading placeholder', () => {
    expect(html).not.toContain('Loading...');
  });

  it('renders the pitch into the markup', () => {
    expect(html).toContain('Open-source web interface for S3 compatible storage');
  });

  // The call to action is the point of the page, and it is rendered before any
  // session has been looked for. If it ever goes back to reporting that, this
  // is what a crawler would index in its place.
  it('renders a real call to action rather than a loading state', () => {
    expect(html).toContain('Get Started');
  });
});

describe('every other route keeps the gate it had', () => {
  // The placeholder exists so the dashboard never renders without a session.
  // Only pages that must be readable before anyone has a session are exempt.
  it.each(['/dashboard', '/dashboard/search', '/dashboard/settings'])(
    'still shows the placeholder on %s',
    (pathname) => {
      const html = renderThroughProviders(pathname, <div>protected content</div>);

      expect(html).toContain('Loading...');
      expect(html).not.toContain('protected content');
    }
  );

  // A path that merely starts with the same letters is not a child route.
  it('does not treat /connections as a connect route', () => {
    const html = renderThroughProviders('/connections', <div>protected content</div>);

    expect(html).toContain('Loading...');
  });
});
