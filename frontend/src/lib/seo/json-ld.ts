/**
 * Structured data as the text of a `<script type="application/ld+json">`.
 *
 * JSON.stringify leaves `<` alone, so a value containing `</script>` - a blog
 * title, say, once WordPress's entities are decoded - would end the element
 * early and turn the rest into markup. Writing `<` as `<` keeps the same
 * JSON (parsers read it back as `<`) and leaves nothing that can close the tag.
 * Every JSON-LD script in the app goes through this.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
