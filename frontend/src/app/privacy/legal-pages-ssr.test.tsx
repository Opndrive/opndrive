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
 * content is really in the markup. The blog is checked here too: it was gated
 * the same way, so the index and every post reached a crawler as "Loading...".
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
// The client half of the landing page. `app/page.tsx` is a server shell around
// it that only adds the FAQ structured data, and being async it cannot go
// through renderToStaticMarkup - while everything this file is checking for,
// and the AuthProvider gate it checks against, lives in here.
import LandingPage from '@/features/landing-page/components/landing-page';
import { landingFeatures } from '@/features/landing-page/components/feature-section';
import { WORK_SMARTER_FEATURES } from '@/features/landing-page/components/work-smarter-section';
import { faqData } from '@/features/landing-page/config/faq-section';
import { NAMED_PROVIDERS_PHRASE } from '@/config/providers';

/**
 * React escapes apostrophes and ampersands on the way into the markup, and the
 * FAQ answers are full of both, so they have to be compared against text that
 * has been turned back. `&amp;` last, or it would decode the others twice.
 */
function decodeEntities(markup: string): string {
  return markup
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

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
  const html = renderThroughProviders('/', <LandingPage namedProviders={NAMED_PROVIDERS_PHRASE} />);

  it('is not replaced by the auth loading placeholder', () => {
    expect(html).not.toContain('Loading...');
  });

  it('renders the pitch into the markup', () => {
    // The heading says what the product is, in the words people search for.
    expect(html).toMatch(/<h1[^>]*>Open-source web UI for S3, R2, MinIO and more<\/h1>/);
    expect(html).toContain('Buckets made beautiful, across every provider');
  });

  // Each of these promised something the app does not do: it keeps no file
  // versions or backups, sharing has a link expiry and nothing else, nothing
  // can be edited in a preview, and "completely secure" is not a claim any
  // software should make. The brand was misspelt too.
  //
  // The two feature carousels render only their active item on the server, so
  // most of their copy never reaches this markup. Their data is checked
  // directly as well, or a claim in the second or third item would pass.
  const carouselCopy = [
    ...landingFeatures(NAMED_PROVIDERS_PHRASE),
    ...WORK_SMARTER_FEATURES,
  ].flatMap((feature) => [feature.title, feature.description, feature.imageAlt]);

  it.each([
    'versioning',
    'backed up',
    'collaboration',
    'completely secure',
    'OpenDrive',
    'View or edit',
  ])('makes no claim the app cannot back up: "%s"', (claim) => {
    const text = [decodeEntities(html), ...carouselCopy].join('\n').toLowerCase();
    expect(text).not.toContain(claim.toLowerCase());
  });

  it('checks every carousel item, not only the one on screen', () => {
    // Three features and four tools; if this drops, an item was missed.
    expect(carouselCopy).toHaveLength((3 + 4) * 3);
  });

  it('names every provider in the registry in the features copy', () => {
    expect(carouselCopy.join(' ')).toContain(NAMED_PROVIDERS_PHRASE);
    expect(NAMED_PROVIDERS_PHRASE).toBe(
      'Amazon S3, Cloudflare R2, Wasabi, Backblaze B2, DigitalOcean Spaces, MinIO'
    );
  });

  // The call to action is the point of the page, and it is rendered before any
  // session has been looked for. If it ever goes back to reporting that, this
  // is what a crawler would index in its place.
  it('renders a real call to action rather than a loading state', () => {
    expect(html).toContain('Get Started');
  });

  // The answers used to be mounted only once their question was clicked, so
  // the eight most substantial paragraphs on the page - the permissions, where
  // the credentials live - reached a crawler as nothing at all. They are in the
  // markup now, collapsed by CSS rather than dropped from the tree.
  it('renders every FAQ answer into the markup, not just the questions', () => {
    const text = decodeEntities(html);
    for (const { question, answer } of faqData) {
      expect(text).toContain(question);
      expect(text).toContain(answer);
    }
  });
});

describe('blog pages through the provider tree', () => {
  // The blog pages are async server components and cannot go through
  // renderToStaticMarkup, so a stand-in child goes through the same gate they
  // do. What is under test is the gate.
  const ARTICLE = 'The body of a blog post, which a crawler has to see.';
  const renderBlog = (pathname: string) =>
    renderThroughProviders(pathname, <article>{ARTICLE}</article>);

  it.each(['/blog', '/blog/configure-cors-for-r2'])(
    '%s renders its content on the server',
    (path) => {
      const html = renderBlog(path);

      expect(html).not.toContain('Loading...');
      expect(html).toContain(ARTICLE);
    }
  );

  it('does not make look-alike paths public', () => {
    expect(renderBlog('/blogroll')).toContain('Loading...');
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
