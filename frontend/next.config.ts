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
