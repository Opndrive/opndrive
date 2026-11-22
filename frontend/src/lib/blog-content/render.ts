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

  // Colour is a nicety. A highlighter that fails to load (a grammar chunk
  // missing after a deploy, say) leaves the code uncoloured, not the post
  // unreadable.
  const highlighter = await getHighlighter().catch((error: unknown) => {
    console.error('Code highlighting is unavailable', error);
    return null;
  });
  transformCodeBlocks(tree, highlighter);

  return { html: toHtml(tree) };
}

/**
 * What the page shows when the body cannot be rendered at all: WordPress's
 * HTML as it came, which is what every post was before any of this. The
 * reader loses the extras, never the post.
 */
function unrenderedContent(html: string): RenderedPostContent {
  return { html };
}

/**
 * A short fingerprint of a post's HTML (FNV-1a and the length), to key the
 * rendered copy by what WordPress actually sent. The modified date is not
 * enough: a synced pattern, a re-captioned image or a dynamic block changes
 * the HTML of every post that shows it without touching their dates.
 */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length.toString(36)}.${(hash >>> 0).toString(36)}`;
}

/** How many rendered posts are kept in memory at once. */
const MEMO_LIMIT = 100;
const memo = new Map<string, Promise<RenderedPostContent>>();

/**
 * renderPostContent, remembered per version of the post's HTML, and never a
 * reason for the page to fail.
 *
 * Every page here is rendered per request (the CSP nonce), so without this a
 * busy post would be parsed and highlighted on every view. The key is the
 * HTML's fingerprint, so any change WordPress sends is rendered afresh, and
 * the memory is per server process, so a deploy never serves HTML from the
 * code it replaced. The oldest entry is dropped once there are MEMO_LIMIT.
 *
 * Should rendering fail, the page gets the post's HTML as WordPress sent it;
 * the failure is not remembered, so the next request tries again.
 */
export function getRenderedPostContent(post: {
  slug: string;
  content: string;
}): Promise<RenderedPostContent> {
  const key = `${post.slug}\u0000${fingerprint(post.content)}`;
  const known = memo.get(key);
  if (known) return known;

  const rendered = renderPostContent(post.content).catch((error: unknown) => {
    memo.delete(key);
    console.error(`Could not render post "${post.slug}"; showing it as WordPress sent it`, error);
    return unrenderedContent(post.content);
  });
  memo.set(key, rendered);

  if (memo.size > MEMO_LIMIT) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }

  return rendered;
}
