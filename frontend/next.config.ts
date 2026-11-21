import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Put the title, description, canonical and social tags in <head> for every
   * visitor, crawlers included.
   *
   * Every page here is rendered per request (the CSP nonce is read from
   * headers()), and on such pages Next.js streams metadata into <body> unless
   * the user agent is on its list of "HTML limited" bots. Googlebot is not on
   * that list. Measured before this change, the tags sat in <body> for
   * Googlebot in the raw HTML and still did after rendering - and Google
   * accepts rel="canonical" only in <head>, so every canonical on the site was
   * being ignored. Matching every user agent turns streaming off. The metadata
   * here is cheap to compute: measured on a local production build, time to
   * first byte did not move beyond run-to-run noise (about 10 ms either way).
   */
  htmlLimitedBots: /.*/,
  /**
   * /blogs is the address people guess, and the one a mistyped link carries.
   * It has never had a page, so it answered 404. A permanent redirect sends
   * readers to the blog and tells search engines the right address, post
   * paths and query strings (?page=2) included.
   */
  /**
   * The drawn blog cover reads its fonts and the logo from /public at run
   * time. Listed here so a serverless build packs them with that route; the
   * Docker image carries /public anyway.
   */
  outputFileTracingIncludes: {
    '/blog/[slug]/cover.png': ['./public/fonts/**/*', './public/logo.png'],
  },
  async redirects() {
    return [
      { source: '/blogs', destination: '/blog', permanent: true },
      { source: '/blogs/:path*', destination: '/blog/:path*', permanent: true },
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
