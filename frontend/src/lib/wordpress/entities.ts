/**
 * WordPress text fields as plain text.
 *
 * WPGraphQL returns `title`, `excerpt` and term names in their rendered form:
 * WordPress has already run them through its texturizer, so an apostrophe
 * arrives as `&#8217;`, an ellipsis as `&hellip;`, an ampersand as `&amp;`,
 * and an editor may have typed `&eacute;` or `&euro;`. Rendered as React text,
 * or escaped again into the RSS feed, those show up literally. Decoding once,
 * where the post is read, gives every consumer the plain text it expects; each
 * then escapes for its own output (React for HTML, escapeXml for the feed,
 * serializeJsonLd for structured data).
 */
import { DecodingMode, decodeHTML } from 'entities';

/**
 * Decodes every HTML entity: all of HTML's named entities, decimal and hex
 * references, in one pass (`&amp;lt;` becomes `&lt;`, not `<`). Strict: only
 * references closed by `;`, which is how WordPress writes them, so a raw `&`
 * in hand-typed SEO text ("x&notation", "?a=1&copy=2") stays as written,
 * where a browser's lenient rules would turn it into "x¬ation". Unknown names
 * stay as written; references to code points that are not characters become
 * U+FFFD, as HTML specifies.
 */
export function decodeHtmlEntities(text: string): string {
  return decodeHTML(text, DecodingMode.Strict);
}

/**
 * Rendered HTML (an excerpt) as plain text: tags removed until none are left,
 * since a single pass is not guaranteed to leave none, then entities decoded
 * once. Decoding
 * last means an encoded "&lt;b&gt;" the author wrote as text comes out as
 * "<b>", text, rather than being stripped as a tag.
 */
export function htmlToText(html: string): string {
  let text = html;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== previous);
  return decodeHtmlEntities(text);
}
