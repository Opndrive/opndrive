import path from 'node:path';
import { visit } from 'unist-util-visit';

const CONTENT_DIR = path.resolve(import.meta.dirname, '../content');

/** Content was authored to also render as plain Markdown on GitHub, so
 *  internal links are relative (`../development/setup.md`) and keep the
 *  real file extension. Two problems for Nextra:
 *
 *  1. Nextra's routes have no `.md`/`.mdx` extension.
 *  2. The browser resolves a relative link against the page's URL, not
 *     against the file it was written in. Routes have no trailing slash, so
 *     `./foo` on `/guides/uploading-files` means `/guides/foo` - right only
 *     while the URL sits at the same depth as the file. A folder's
 *     `index.md`, served at `/guides` rather than `/guides/`, breaks that:
 *     its `./foo` would resolve to `/foo`.
 *
 *  So links are rewritten to root-relative paths (`/guides/uploading-files`)
 *  computed from the current file's real position in content/, which are
 *  right from any URL. The site is served from the root of its own
 *  subdomain (docs.opndrive.app), so no basePath is involved. */
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
