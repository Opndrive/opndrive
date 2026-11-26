---
'frontend': minor
---

Draft previews, instant updates on publish, and sanitized post HTML

- **Draft previews.** WordPress's Preview button can now open a draft on the
  site itself, rendered exactly as it will be published, with a "Preview"
  banner. The link is signed and expires within the hour; the page is only shown
  to the browser that opened it, is never cached or indexed, and is not counted
  by analytics. The WordPress side is a small must-use plugin in `wordpress/`,
  which also adds a read-only "Opndrive previewer" role: it can read drafts
  through WPGraphQL and cannot edit, publish, delete or upload.
- **Changes show at once.** A second must-use plugin tells the site when a post
  is published, updated, unpublished or deleted. The sitemap is now refreshed
  along with the post, the index and the feed, instead of up to an hour later.
  The revalidate endpoint compares its secret in constant time, checks the slug
  and tags it is given, and no longer accepts the secret in a URL.
- **Post HTML is sanitized** before it reaches the page, the same origin that
  holds storage keys. Scripts, event handlers, iframes, forms, styles and
  `javascript:` links are removed; text, headings, links, tables, code, figures
  and responsive pictures are kept. If rendering fails, the fallback is
  sanitized too, never the raw HTML.
- **A draft can never appear on a public page.** A post looked up by its address
  is shown only when WordPress says it is published, and the blog needs no
  WordPress credential: `WORDPRESS_AUTH_TOKEN` is deprecated. It is still sent
  while set, so a WordPress that refuses anonymous requests keeps working; once
  it is unset, no public request signs in. Only the preview signs in, as its own
  read-only user.
