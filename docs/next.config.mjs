import nextra from 'nextra';
import { remarkMermaid } from './lib/remark-mermaid.mjs';
import { remarkStripMdLinks } from './lib/remark-strip-md-links.mjs';

const withNextra = nextra({
  defaultShowCopyCode: true,
  mdxOptions: {
    remarkPlugins: [remarkMermaid, remarkStripMdLinks],
  },
});

export default withNextra({
  reactStrictMode: true,
  // Analytics is off unless both are set at build time; only our production
  // deployment sets them. Defined here so an unset one becomes "" in the
  // bundle, which lets the build see analytics is off and leave its code out
  // (see components/public-analytics.tsx).
  env: {
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '',
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? '',
  },
  // Deployed at its own subdomain (docs.opndrive.app), not nested under
  // the frontend app's path - so no basePath needed. This app owns "/".
  eslint: {
    ignoreDuringBuilds: true,
  },
});
