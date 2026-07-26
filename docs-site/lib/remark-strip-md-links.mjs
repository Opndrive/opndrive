import { visit } from 'unist-util-visit';

/** Content was authored to also render as plain Markdown on GitHub, so
 *  internal links use real `.md` filenames (e.g. `../development/setup.md`).
 *  Nextra's routes don't have that extension, so strip it from relative
 *  links only - absolute URLs (https://...) are left untouched. */
export function remarkStripMdLinks() {
  return (tree) => {
    visit(tree, 'link', (node) => {
      if (typeof node.url !== 'string') return;
      if (/^[a-z]+:\/\//i.test(node.url) || node.url.startsWith('#')) return;

      node.url = node.url.replace(/\.mdx?(?=$|#)/i, '');
    });
  };
}
