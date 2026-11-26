/**
 * What a post's HTML may contain once it reaches the page.
 *
 * A post is written in WordPress and shown on opndrive.app, the same origin
 * that holds people's storage keys in localStorage. The CSP stops scripts in a
 * post from running, but it is the only thing that does, and it leaves
 * iframes, forms, meta refreshes and styles alone. So the HTML is cut down to
 * an allowlist first, before any other step sees it: what an article needs
 * (text, headings, lists, links, tables, code, figures and pictures) and
 * nothing else.
 *
 * Built on hast-util-sanitize's default schema, the one GitHub uses for
 * READMEs, with what WordPress posts add on top: classes (blocks are styled by
 * them), figures and captions, and responsive pictures. Not allowed: script,
 * style (element or attribute), iframe, embed, object, form controls, event
 * handlers, and any URL that is not http, https, mailto or a fragment.
 */
import type { Root } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { defaultSchema, sanitize, type Schema } from 'hast-util-sanitize';
import { toHtml } from 'hast-util-to-html';

/**
 * The default schema limits `class` on a few tags to fixed values (GitHub's
 * footnote and task-list markup). WordPress styles every block by its classes,
 * so those limits are lifted: any class is allowed on any element.
 */
function withAnyClass(attributes: NonNullable<Schema['attributes']>) {
  const lifted: NonNullable<Schema['attributes']> = {};
  for (const [tag, list] of Object.entries(attributes)) {
    lifted[tag] = list.filter((entry) => !(Array.isArray(entry) && entry[0] === 'className'));
  }
  return lifted;
}

const base = withAnyClass(defaultSchema.attributes ?? {});

export const POST_SCHEMA: Schema = {
  ...defaultSchema,
  tagNames: [
    // No form controls: the default keeps disabled checkboxes for task lists,
    // which a post does not need.
    ...(defaultSchema.tagNames ?? []).filter((tag) => tag !== 'input'),
    'figure',
    'figcaption',
    'caption',
    'mark',
    'u',
    'small',
    'abbr',
    'cite',
    'time',
  ],
  attributes: {
    ...base,
    '*': [...(base['*'] ?? []), 'className'],
    a: [...(base.a ?? []), 'target', 'rel'],
    img: [...(base.img ?? []), 'alt', 'srcSet', 'sizes', 'width', 'height', 'loading', 'decoding'],
    source: [...(base.source ?? []), 'srcSet', 'sizes', 'type', 'media'],
  },
  // Removed together with everything inside them, rather than unwrapped: the
  // text inside a <style> or an <iframe> fallback is not part of the article.
  strip: ['script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math'],
  // Heading ids stay as written, so links to a section (#install) keep
  // working and the table of contents can use them. `name` is still prefixed,
  // which is what keeps a post from clobbering globals through named access.
  clobber: ['name'],
};

/** The tree with everything outside POST_SCHEMA removed. */
export function sanitizePost(tree: Root): Root {
  return sanitize(tree, POST_SCHEMA) as Root;
}

/** The same, for HTML as a string. */
export function sanitizePostHtml(html: string): string {
  return toHtml(sanitizePost(fromHtml(html, { fragment: true })));
}
