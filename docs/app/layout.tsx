import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Layout, Navbar, Footer } from 'nextra-theme-docs';
import { Head } from 'nextra/components';
import { DiscordIcon } from 'nextra/icons';
import { getPageMap } from 'nextra/page-map';
import { APP_URL, DISCORD_URL } from '@/lib/links';
import { BASE_OPEN_GRAPH, DOCS_URL } from '@/lib/site';
import { AnalyticsGate } from '@/components/analytics-gate';
import 'nextra-theme-docs/style.css';

export const metadata: Metadata = {
  // Without this, relative image URLs resolve against localhost in a local
  // build and only come out right on Vercel by way of its fallback.
  metadataBase: new URL(DOCS_URL),
  title: {
    default: 'Opndrive Docs',
    template: '%s - Opndrive Docs',
  },
  description:
    'Documentation for Opndrive, an open-source web UI for Amazon S3 and S3-compatible storage.',
  openGraph: BASE_OPEN_GRAPH,
  twitter: {
    card: 'summary_large_image',
    // The same handle the main site uses, from frontend/src/lib/seo/config.ts.
    site: '@opndrive',
    images: ['/og-image.png'],
  },
};

/**
 * The navbar, with both of its icon links named.
 *
 * Nextra wraps the logo in a link labelled "Home page", which hides the
 * visible "Opndrive" from assistive tech and fails WCAG's label-in-name rule.
 * With `logoLink={false}` Nextra renders the logo as given, so the logo here
 * is its own link, named by its visible text. The classes are Nextra's own,
 * from the link it would have rendered.
 *
 * Nextra's default Discord icon has no label, unlike its GitHub one, so the
 * chat link had no accessible name at all. This passes the same icon with one.
 */
const navbar = (
  <Navbar
    logoLink={false}
    logo={
      <Link
        href="/"
        className="x:flex x:items-center x:transition-opacity x:focus-visible:nextra-focus x:hover:opacity-75"
        style={{ gap: '0.5rem' }}
      >
        <Image src="/logo.png" alt="" width={24} height={24} priority unoptimized />
        <b>Opndrive</b>
      </Link>
    }
    projectLink="https://github.com/Opndrive/opndrive"
    // Nextra renders this beside the project link, mirroring the app's own
    // navbar pairing.
    chatLink={DISCORD_URL}
    chatIcon={<DiscordIcon width="24" aria-label="Join our Discord" />}
  />
);

/**
 * The legal pages live once, on the main site, and docs links out to them.
 * Restating the policy here in MDX would guarantee the two drift, and a stale
 * privacy policy is worse than no second copy of it.
 */
const footer = (
  <Footer style={{ paddingTop: '1rem', paddingBottom: '1rem' }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
      <span>
        AGPL-3.0 {new Date().getFullYear()} © Opndrive.
        {' · '}
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
          Join our Discord
        </a>
      </span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1rem', fontSize: '0.85em' }}>
        <a href={APP_URL}>Opndrive</a>
        <a href={`${APP_URL}/privacy`}>Privacy Policy</a>
        <a href={`${APP_URL}/terms`}>Terms of Service</a>
        <a href={`${APP_URL}/privacy#storage`}>Cookies and storage</a>
      </span>
    </div>
  </Footer>
);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/Opndrive/opndrive/tree/main/docs"
          footer={footer}
          sidebar={{ defaultMenuCollapseLevel: 1 }}
        >
          {children}
        </Layout>
        <AnalyticsGate />
      </body>
    </html>
  );
}
