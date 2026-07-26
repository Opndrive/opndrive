import type { Metadata } from 'next';
import { Layout, Navbar, Footer } from 'nextra-theme-docs';
import { Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import 'nextra-theme-docs/style.css';

export const metadata: Metadata = {
  title: {
    default: 'Opndrive Docs',
    template: '%s - Opndrive Docs',
  },
  description:
    'Documentation for Opndrive, an open-source web UI for Amazon S3 and S3-compatible storage.',
};

const navbar = <Navbar logo={<b>Opndrive</b>} projectLink="https://github.com/Opndrive/opndrive" />;

const footer = <Footer>AGPL-3.0 {new Date().getFullYear()} © Opndrive.</Footer>;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/Opndrive/opndrive/tree/main/docs-site"
          footer={footer}
          sidebar={{ defaultMenuCollapseLevel: 1 }}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
