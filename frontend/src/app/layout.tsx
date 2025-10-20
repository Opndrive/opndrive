import '@/app/globals.css';
import { AuthProvider } from '@/context/auth-context';
import { NotificationProvider } from '@/context/notification-context';
import { ZustandBridge } from '@/context/zustand-bridge';
import { UploadProvider } from '@/features/upload/context/upload-context';
import { ThemeProvider } from '@/providers/theme-provider';
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
  metadataBase: new URL('https://www.opndrive.app'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Opndrive - Open-source S3 Compatible Storage Interface',
    description:
      'Open-source web interface for S3 compatible storage. Connect your own bucket and manage files with complete control over your data.',
    url: 'https://www.opndrive.app',
    siteName: 'Opndrive',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Opndrive - S3 Storage Interface',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Opndrive - Open-source S3 Compatible Storage Interface',
    description:
      'Open-source web interface for S3 compatible storage. Connect your own bucket and manage files with complete control over your data.',
    images: ['/og-image.png'],
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
  verification: {
    google: 'your-google-verification-code', // Add your Google Search Console verification code
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* JSON-LD Structured Data for Google */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Opndrive',
              url: 'https://www.opndrive.app',
              logo: 'https://www.opndrive.app/logo.png',
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
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'Opndrive',
              url: 'https://www.opndrive.app',
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
          dangerouslySetInnerHTML={{
            __html: `
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
              <NotificationProvider>{children}</NotificationProvider>
            </UploadProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
