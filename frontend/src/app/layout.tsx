import '@/app/globals.css';
import { AuthProvider } from '@/context/auth-context';
import { NotificationProvider } from '@/context/notification-context';
import { ZustandBridge } from '@/context/zustand-bridge';
import { UploadProvider } from '@/features/upload/context/upload-context';
import { ThemeProvider } from '@/providers/theme-provider';
import { headers } from 'next/headers';
import { PAGE_PROFILE_GLOBAL, type PageProfile } from '@/lib/privacy/page-profile';
import { SITE_URL } from '@/config/links';
import { ConfirmDialogHost } from '@/shared/components/ui/confirm-dialog';
import { BASE_OPEN_GRAPH, BASE_TWITTER } from '@/lib/seo/social';
import { serializeJsonLd } from '@/lib/seo/json-ld';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Opndrive - Open-source S3 Compatible Storage Interface',
  description:
    'Open-source web interface for S3 compatible storage. Connect your own bucket and manage files with complete control over your data.',
  icons: {
    icon: [{ url: '/favicon.ico' }],
    shortcut: [{ url: '/favicon.ico' }],
    apple: [{ url: '/favicon.ico' }],
  },
  keywords: [
    'Opndrive',
    'S3 storage management',
    'cloud storage management',
    'open source',
    'file management',
    'AWS S3',
    'digital ocean spaces',
    'wasabi storage',
    'backblaze b2',
    'minio',
    'object storage',
    'bucket management',
  ],
  authors: [{ name: 'Opndrive' }],
  creator: 'Opndrive',
  publisher: 'Opndrive',
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    ...BASE_OPEN_GRAPH,
    title: 'Opndrive - Open-source S3 Compatible Storage Interface',
    description:
      'Open-source web interface for S3 compatible storage. Connect your own bucket and manage files with complete control over your data.',
    url: SITE_URL,
  },
  twitter: {
    ...BASE_TWITTER,
    title: 'Opndrive - Open-source S3 Compatible Storage Interface',
    description:
      'Open-source web interface for S3 compatible storage. Connect your own bucket and manage files with complete control over your data.',
  },
  manifest: '/manifest.json',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  /**
   * Only emitted once a real code is configured.
   *
   * The placeholder that stood here put
   * `<meta name="google-site-verification" content="your-google-verification-code">`
   * on every page: a claim to own the site, backed by a token that verifies
   * nothing. Read from the server environment, so it never reaches the client
   * bundle, and left off entirely when unset.
   */
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Set by middleware. Every inline script below carries it, which is what
  // lets script-src stay nonce-only instead of allowing 'unsafe-inline'.
  const requestHeaders = await headers();
  const nonce = requestHeaders.get('x-nonce') ?? undefined;
  // Which policy this document arrived with (see page-profile.ts). Written by
  // the inline script below, which runs once per document: moving between
  // pages never runs it again, so it keeps describing the policy in force.
  const pageProfile: PageProfile =
    requestHeaders.get('x-page-profile') === 'public' ? 'public' : 'app';

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* JSON-LD Structured Data for Google. Every nonce'd script here allows a
            hydration difference on that one attribute: the browser hides a nonce
            from the DOM once it has used it, so it never matches. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              // The same identifier the blog's posts use for their author and
              // publisher, so all of them are one organisation.
              '@id': `${SITE_URL}/#organization`,
              name: 'Opndrive',
              url: SITE_URL,
              logo: `${SITE_URL}/logo.png`,
              sameAs: ['https://github.com/opndrive/opndrive'],
              description: 'Open-source web interface for S3 compatible storage',
              foundingDate: '2024',
              contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'Customer Support',
                url: 'https://github.com/opndrive/opndrive/issues',
              },
            }),
          }}
        />
        <script
          nonce={nonce}
          suppressHydrationWarning
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'Opndrive',
              url: SITE_URL,
              applicationCategory: 'DeveloperApplication',
              operatingSystem: 'Web',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
              description:
                'Open-source web interface for S3 compatible storage. Connect your own bucket and manage files with complete control over your data.',
            }),
          }}
        />
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              window[${JSON.stringify(PAGE_PROFILE_GLOBAL)}] = ${JSON.stringify(pageProfile)};
              (function() {
                try {
                  const storageKey = 'ui-theme';
                  const theme = localStorage.getItem(storageKey);
                  const root = document.documentElement;
                  
                  if (theme === 'dark') {
                    root.setAttribute('data-theme', 'dark');
                  } else if (theme === 'light') {
                    root.setAttribute('data-theme', 'light');
                  } else {
                    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                    root.setAttribute('data-theme', systemTheme);
                  }
                } catch (e) {
                  // Theme setup failed, use default
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        <AuthProvider>
          <ZustandBridge />
          <ThemeProvider defaultTheme="system" storageKey="ui-theme">
            <UploadProvider>
              <NotificationProvider>
                {children}
                {/* One shared confirmation dialog. Mounted here so anything
                    below can call confirmAction() without rendering its own. */}
                <ConfirmDialogHost />
              </NotificationProvider>
            </UploadProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
