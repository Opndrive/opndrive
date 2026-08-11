import type { Metadata } from 'next';
import Image from 'next/image';
import { Analytics } from '@vercel/analytics/next';
import { Layout, Navbar, Footer } from 'nextra-theme-docs';
import { Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import { DISCORD_URL } from '@/lib/links';
import 'nextra-theme-docs/style.css';

export const metadata: Metadata = {
  title: {
    default: 'Opndrive Docs',
    template: '%s - Opndrive Docs',
  },
  description:
    'Documentation for Opndrive, an open-source web UI for Amazon S3 and S3-compatible storage.',
  openGraph: {
    images: ['/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og-image.png'],
  },
};

const navbar = (
  <Navbar
    logo={
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Image src="/logo.png" alt="" width={24} height={24} priority unoptimized />
        <b>Opndrive</b>
      </span>
    }
    projectLink="https://github.com/Opndrive/opndrive"
    // Nextra renders this beside the project link and defaults the icon to
    // Discord, mirroring the app's own navbar pairing.
    chatLink={DISCORD_URL}
  />
);

const footer = (
  <Footer style={{ paddingTop: '1rem', paddingBottom: '1rem' }}>
    <span>
      AGPL-3.0 {new Date().getFullYear()} © Opndrive.
      {' · '}
      <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
        Join our Discord
      </a>
    </span>
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
        <Analytics />
      </body>
    </html>
  );
}
