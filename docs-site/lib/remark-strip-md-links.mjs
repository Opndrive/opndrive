import path from 'node:path';
import { visit } from 'unist-util-visit';

const CONTENT_DIR = path.resolve(import.meta.dirname, '../content');

/** Content was authored to also render as plain Markdown on GitHub, so
 *  internal links are relative (`../development/setup.md`) and keep the
 *  real file extension. Two problems for Nextra:
 *
 *  1. Nextra's routes have no `.md`/`.mdx` extension.
 *  2. Relative links break under this app's basePath. A page's own route
 *     (e.g. `/docs/guides/uploading-files`, no trailing slash) makes the
 *     browser resolve `./foo` as a sibling of the LAST segment, i.e.
 *     `/docs/guides/foo` - that part's fine - but resolve it from the
 *     content ROOT (e.g. a link on the homepage, served at exactly
 *     `/docs`) and `./guides/foo` resolves to `/guides/foo`, silently
 *     dropping the basePath entirely.
 *
 *  So links are rewritten to root-relative paths (`/guides/uploading-files`)
 *  computed from the current file's real position in content/, rather than
 *  left as browser-resolved relative paths. A root-relative path is what
 *  Next.js's basePath auto-prefixing actually requires to kick in. */
export function remarkStripMdLinks() {
  return (tree, file) => {
    const relPath = path.relative(CONTENT_DIR, file.path).split(path.sep).join('/');
    const currentDir = path.posix.dirname(relPath);

    visit(tree, 'link', (node) => {
      if (typeof node.url !== 'string') return;
      if (/^[a-z]+:\/\//i.test(node.url) || node.url.startsWith('#') || node.url.startsWith('/')) {
        return;
      }

      const [target, hash] = node.url.split('#');
      if (!target) return;

      let resolved = path.posix.join(currentDir, target).replace(/\.mdx?$/i, '');
      if (resolved === 'index' || resolved.endsWith('/index')) {
        resolved = resolved.slice(0, -'index'.length);
      }

      node.url = '/' + resolved.replace(/^\/+/, '') + (hash ? `#${hash}` : '');
    });
  };
}
