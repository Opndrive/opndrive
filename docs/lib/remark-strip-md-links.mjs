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
      // Anything with a scheme is not a content file: https:, but also
      // mailto: and tel:, which have no "//". A relative link with a colon
      // before its first slash ("release:v2.md") is a scheme to browsers and
      // to GitHub too, where this content also renders, so it is left alone
      // for the same reason; write it "./release:v2.md" to make it a file.
      if (
        /^[a-z][a-z0-9+.-]*:/i.test(node.url) ||
        node.url.startsWith('#') ||
        node.url.startsWith('/')
      ) {
        return;
      }

      const [target, hash] = node.url.split('#');
      if (!target) return;

      // A folder's index file is served at the folder's path with no trailing
      // slash (`guides/index.md` is `/guides`), matching the canonical URLs;
      // `/guides/` would only answer with a redirect. The same goes for a link
      // to the folder itself (`./`, `../`). Only a file named exactly `index`
      // is a folder's index to Nextra (to-page-map.js), so INDEX.md is a page
      // of its own and keeps its name.
      const joined = path.posix
        .join(currentDir, target)
        .replace(/\.mdx?$/i, '')
        .replace(/(^|\/)index$/, '')
        .replace(/\/+$/, '');
      const resolved = joined === '.' ? '' : joined;

      node.url = '/' + resolved.replace(/^\/+/, '') + (hash ? `#${hash}` : '');
    });
  };
}
