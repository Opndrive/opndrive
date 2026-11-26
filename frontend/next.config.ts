import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Analytics is off unless both of these are set when the site is built, and
   * only our own production deployment sets them.
   *
   * Defined here so an unset variable becomes "" in the bundle rather than a
   * lookup at run time. That is what lets the build see that analytics is off
   * and leave its code out: PublicAnalytics reads both in a condition that
   * folds to false, and the import of the sender goes with it. Self-hosted
   * builds and the Docker image therefore carry no analytics code, key or host.
   */
  env: {
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '',
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '',
  },
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
   * The drawn blog cover reads its fonts and the logo from /public at run
   * time. Listed here so a serverless build packs them with that route; the
   * Docker image carries /public anyway.
   */
  outputFileTracingIncludes: {
    '/blog/[slug]/cover.png': ['./public/fonts/**/*', './public/logo.png'],
  },
  /**
   * /blogs is the address people guess, and the one a mistyped link carries.
   * It has never had a page, so it answered 404. A permanent redirect sends
   * readers to the blog and tells search engines the right address, post
   * paths and query strings (?page=2) included.
   */
  /**
   * The editors' draft preview is never indexed and never cached, whatever
   * the page itself says. Belt and braces with the page's own robots tag.
   */
  async headers() {
    const privatePage = [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'Cache-Control', value: 'private, no-store' },
    ];
    return [
      { source: '/preview/:path*', headers: privatePage },
      { source: '/api/preview/:path*', headers: privatePage },
      { source: '/api/preview', headers: privatePage },
    ];
  },
  async redirects() {
    return [
      { source: '/blogs', destination: '/blog', permanent: true },
      { source: '/blogs/:path*', destination: '/blog/:path*', permanent: true },
    ];
  },
  images: {
    /**
     * Local images next/image may show. Listing any turns the list into a
     * rule, so the first entry keeps every local image allowed as before
     * (without a query string); the second admits the drawn blog covers,
     * whose ?v= changes with the post. Next.js warns about local images with
     * a query string that no pattern admits, and 16 refuses them.
     */
    localPatterns: [{ pathname: '/**', search: '' }, { pathname: '/blog/*/cover.png' }],
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
