# frontend

## 3.1.0

### Minor Changes

- 060fccc: Give each S3 provider its own page and rebuild connect as an
  onboarding flow

  /connect was blocked in robots.txt and served Loading as its entire body, so
  it could not be indexed at all. It now renders real html and every provider
  has its own route with its own title, heading, description and canonical,
  generated from a single registry that also feeds the sitemap.

  The page itself is now a focused flow: provider cards first, then one card per
  provider with the logo, a back link, a searchable region combobox that fixes
  the old height and scrolling bug, an accessible reveal toggle for the secret
  key, and a connect button that sticks to the bottom.

  Anything the list does not name is covered by a custom-endpoint provider at
  /connect/custom-endpoint. That link previously went to /connect/minio, which
  sent people on DigitalOcean Spaces or Scaleway to a page about self-hosting
  MinIO. The hub also now points anyone wanting a provider added at the issue
  tracker.

- d8cb534: Add the privacy architecture: policy pages, opt out, CSP and a
  storage registry

  Publishes a privacy policy and terms, adds a site footer and docs footer
  links, and offers a working analytics opt out that carries across both
  subdomains on a cookie written only when somebody actually opts out. Analytics
  now mounts through a gate that honours it. A nonce based Content Security
  Policy protects the credentials held in localStorage, and a storage key
  registry generates the policy table so a new key cannot ship undisclosed.

### Patch Changes

- 26be79d: Stop delete operations outliving the session. The upload store now
  owns each delete's AbortController, so ending a session aborts everything in
  flight instead of leaving a loop deleting objects under credentials the user
  has already signed out of. Cancelling from the operations modal now aborts the
  delete as well, rather than only removing its card.
- bdf0b80: Animate menus open and land the multi-select bar with them. The
  animation utilities were never imported, so every Radix transition compiled to
  nothing; menus now unfold downward and selection fires on pointer down, at the
  same moment the menu opens, instead of trailing it by the length of the press.
- 43c81b6: Put the open file preview in the URL. Opening a preview now adds a
  `preview` query parameter to the current page, so Back closes it instead of
  leaving the folder, and a preview can be linked, bookmarked and reloaded.
  Arrowing between files replaces the entry rather than pushing, so a long
  browse does not bury the folder. The separate `/dashboard/preview/[etag]` page
  is retired to a redirect and "Open in new tab" points at the modal URL, keyed
  by S3 key so a shared link survives the file being re-uploaded.
- 6b11c4d: Stop sending private data to analytics, and correct the privacy copy

  Search terms and S3 object keys moved from the query string into the URL hash,
  which a browser never transmits, and analytics now redacts whatever is left.
  The settings privacy panel no longer claims we collect nothing, and the four
  privacy toggles that no code read are gone apart from the analytics opt out.

- cd66664: Replace the native `window.confirm` used for deletes with a themed
  dialog built on the Radix alert-dialog primitive, covering the file menu, the
  folder menu and multi-select delete. Also gives the advanced search sheet a
  dialog role, a name from its heading, Escape handling from anywhere, and focus
  that moves into the panel on open and back to the trigger on close.

  Defines the `destructive` colour the shadcn primitives already referenced. It
  was never in the palette, so `bg-destructive` generated no rule at all and the
  confirm button rendered as white text on a white dialog.

  Pins the dialog border to the theme's border colour. Tailwind v4 leaves a bare
  `border` at `currentColor`, so both dialogs were outlining themselves in their
  own text colour - a hard white rectangle in dark mode.

- 55b08f1: Show what went wrong when a bucket cannot be reached, instead of a
  skeleton that never resolves.

  A failed listing set an error status that no page read, so both dashboard
  pages rendered the loading skeleton forever. The store now keeps the reason
  and hands the page one value it cannot read without deciding what a failure
  looks like, so the next view added cannot repeat the omission.

  Credentials are also proved before a session is built on them: constructing
  the client touched no network, so wrong keys only failed later on the
  dashboard, a page away from the form that could fix them. They now fail on
  /connect, naming whether the problem is the keys, the bucket, the region or a
  missing CORS rule.

- 505f32c: Add vercel speed analytics
- @opndrive/s3-api@3.1.0
