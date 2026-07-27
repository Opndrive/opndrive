import type { NextConfig } from 'next';

// docs/ is a separate Next.js app, mounted at /docs via Next.js's
// "multi-zones" pattern rather than being a route in this app. In
// production, point NEXT_PUBLIC_DOCS_URL at wherever docs/ is deployed;
// in local dev it defaults to the docs dev server's port.
const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL || 'http://localhost:3001';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: '/docs', destination: `${docsUrl}/docs` },
      { source: '/docs/:path*', destination: `${docsUrl}/docs/:path*` },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'secure.gravatar.com',
        port: '',
        pathname: '/avatar/**',
      },
      {
        protocol: 'https',
        hostname: '**.gravatar.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.wp.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'localhost',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'wordpress.sasewa.org',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
