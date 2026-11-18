/**
 * WordPress text fields as plain text.
 *
 * WPGraphQL returns `title`, `excerpt` and term names in their rendered form:
 * WordPress has already run them through its texturizer, so an apostrophe
 * arrives as `&#8217;`, an ellipsis as `&hellip;`, an ampersand as `&amp;`.
 * Rendered as React text, or escaped again into the RSS feed, those show up
 * literally. Decoding once, where the post is read, gives every consumer the
 * plain text it expects; each then escapes for its own output (React for HTML,
 * escapeXml for the feed, serializeJsonLd for structured data).
 */

/** The named entities WordPress's texturizer and editors actually produce. */
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  // Written as a code: the character itself is invisible in source.
  nbsp: String.fromCharCode(0xa0),
  hellip: '…',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  prime: '′',
  Prime: '″',
  times: '×',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  middot: '·',
  bull: '•',
};

function fromCodePoint(code: number, original: string): string {
  // Not a character: NUL, surrogates and anything past Unicode's range stay as
  // written rather than becoming a broken string.
  if (code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) return original;
  return String.fromCodePoint(code);
}

/**
 * Decodes numeric (`&#8217;`, `&#x2019;`) and common named entities in one
 * pass, so `&amp;lt;` becomes `&lt;` and not `<`. Unknown names are left as
 * written.
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g, (match, dec, hex, name) => {
    if (dec !== undefined) return fromCodePoint(Number.parseInt(dec, 10), match);
    if (hex !== undefined) return fromCodePoint(Number.parseInt(hex, 16), match);
    return Object.hasOwn(NAMED, name) ? NAMED[name]! : match;
  });
}
