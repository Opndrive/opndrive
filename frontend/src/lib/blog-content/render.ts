/**
 * A post's HTML, as WordPress rendered it, made ready for the page.
 *
 * The HTML is parsed once into a tree, each step below works on that tree, and
 * the result is written back out as HTML. Working on a tree rather than on the
 * string is what lets the steps be exact: a code block is a `<pre>` element,
 * not whatever a regular expression happens to match.
 *
 * This runs on the server only. The steps are pure, so a post renders the same
 * way every time; `getRenderedPostContent` keeps the result, since rendering a
 * long post with several highlighted blocks takes tens of milliseconds.
 */

import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import { transformCodeBlocks } from './code-blocks';
import { getHighlighter } from './highlighter';

export interface RenderedPostContent {
  /** The post body, ready for dangerouslySetInnerHTML. */
  html: string;
}

export async function renderPostContent(html: string): Promise<RenderedPostContent> {
  const tree = fromHtml(html, { fragment: true });

  transformCodeBlocks(tree, await getHighlighter());

  return { html: toHtml(tree) };
}

/** How many rendered posts are kept in memory at once. */
const MEMO_LIMIT = 100;
const memo = new Map<string, Promise<RenderedPostContent>>();

/**
 * renderPostContent, remembered per post version.
 *
 * Every page here is rendered per request (the CSP nonce), so without this a
 * busy post would be parsed and highlighted on every view. The key includes
 * the post's modified date, so an edit in WordPress is rendered afresh, and
 * the memory is per server process, so a deploy never serves HTML from the
 * code it replaced. The oldest entry is dropped once there are MEMO_LIMIT.
 */
export function getRenderedPostContent(post: {
  slug: string;
  modifiedDate: string;
  content: string;
}): Promise<RenderedPostContent> {
  const key = `${post.slug}\u0000${post.modifiedDate}`;
  const known = memo.get(key);
  if (known) return known;

  const rendered = renderPostContent(post.content);
  memo.set(key, rendered);
  // A failed render is not kept: the next request tries again.
  rendered.catch(() => memo.delete(key));

  if (memo.size > MEMO_LIMIT) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }

  return rendered;
}
