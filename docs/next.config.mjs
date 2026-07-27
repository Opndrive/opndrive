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
  // Served under the frontend app's /docs path via rewrites (see
  // frontend/next.config.ts) - this is Next.js's "multi-zones" pattern for
  // two separate apps sharing one domain. basePath makes every internal
  // link/asset Nextra generates resolve under /docs instead of colliding
  // with the frontend app's own /_next/* namespace at the domain root.
  basePath: '/docs',
  eslint: {
    ignoreDuringBuilds: true,
  },
});
