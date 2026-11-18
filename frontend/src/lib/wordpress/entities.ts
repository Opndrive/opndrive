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
import { decodeHTML } from 'entities';

/**
 * Decodes every HTML entity the way a browser reads text: all of HTML's named
 * entities, decimal and hex references, in one pass (`&amp;lt;` becomes `&lt;`,
 * not `<`). Unknown names stay as written; references to code points that are
 * not characters become U+FFFD, as HTML specifies.
 */
export function decodeHtmlEntities(text: string): string {
  return decodeHTML(text);
}
