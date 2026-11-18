/**
 * Text for XML documents the app writes itself (the RSS feed, the CORS XML
 * some providers take).
 */

/** Characters XML 1.0 does not allow at all, which outside text can carry. */
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/**
 * `text` made safe for XML element content or a quoted attribute: the five
 * special characters escaped, and characters XML cannot carry at all removed
 * rather than left to make the document unparseable.
 */
export function escapeXml(text: string): string {
  return text.replace(INVALID_XML_CHARS, '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]!);
}
