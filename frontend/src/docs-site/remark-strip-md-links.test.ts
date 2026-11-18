// @vitest-environment node
/**
 * The docs' remark plugin that turns relative .md links into site routes
 * (docs/lib/remark-strip-md-links.mjs).
 *
 * Node environment: the plugin and this test find docs/content from their own
 * file locations, which jsdom does not give as file: URLs.
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { remarkStripMdLinks } from '../../../docs/lib/remark-strip-md-links.mjs';

const contentFile = (rel: string) =>
  fileURLToPath(new URL(`../../../docs/content/${rel}`, import.meta.url));

/** The URL a link written in `from` ends up with. */
function rewrite(url: string, from = 'guides/uploading-files.md'): string {
  const link = { type: 'link', url, children: [] };
  const tree = { type: 'root', children: [{ type: 'paragraph', children: [link] }] };
  remarkStripMdLinks()(tree, { path: contentFile(from) });
  return link.url;
}

describe('remarkStripMdLinks', () => {
  it('turns a relative .md link into a root-relative route', () => {
    expect(rewrite('./previewing-files.md')).toBe('/guides/previewing-files');
    expect(rewrite('../reference/faq.md')).toBe('/reference/faq');
  });

  it('keeps the fragment', () => {
    expect(rewrite('./connecting-storage.md#required-iam-permissions')).toBe(
      '/guides/connecting-storage#required-iam-permissions'
    );
  });

  it("links a folder's index file at the folder's path, with no trailing slash", () => {
    expect(rewrite('../guides/index.md')).toBe('/guides');
    expect(rewrite('./index.md')).toBe('/guides');
    expect(rewrite('../index.mdx')).toBe('/');
  });

  it('leaves links with a scheme alone, including mailto: and tel:', () => {
    expect(rewrite('https://github.com/Opndrive/opndrive')).toBe(
      'https://github.com/Opndrive/opndrive'
    );
    expect(rewrite('mailto:security@opndrive.app')).toBe('mailto:security@opndrive.app');
    expect(rewrite('tel:+10000000000')).toBe('tel:+10000000000');
  });

  it('leaves fragment-only and root-relative links alone', () => {
    expect(rewrite('#required-iam-permissions')).toBe('#required-iam-permissions');
    expect(rewrite('/reference/faq')).toBe('/reference/faq');
  });
});
