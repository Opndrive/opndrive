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
  eslint: {
    ignoreDuringBuilds: true,
  },
});
