---
'frontend': patch
---

Put the FAQ answers in the page, and stop the feature list rotating at readers

The eight FAQ answers were mounted only once their question was clicked, so the
most substantial writing on the landing page - which S3 permissions are needed,
where the credentials are actually stored - reached a crawler as nothing at all.
They are in the markup now, collapsed by a `0fr` grid row rather than dropped
from the tree, and the SSR test asserts every answer is really there. The
accordion also has `aria-expanded` and `aria-controls` it never had, and each
question is a heading wrapping its button rather than a heading buried inside
one, so the eight questions form an outline a reader can navigate.

`/` is now a server shell around the client page, which is what lets it emit
FAQPage structured data built from the same `faqData` the section renders -
Google requires the markup to describe what a visitor can see, and generating
both from one array is what keeps that true when a question is edited. The route
was already server-rendered on demand, so the shell costs nothing new.

`verification` no longer ships `content="your-google-verification-code"` on
every page: a claim to own the site backed by a token that verifies nothing. It
reads `GOOGLE_SITE_VERIFICATION` from the server environment and is left off
when unset.

Both feature sections rotated every six seconds for as long as the tab was open.
Narrower than `lg` the image column beside the list is `hidden`, so the timer's
only effect was to swap the paragraph a reader was in the middle of - and the
pause is bound to hover, which a touch device never fires, so on a phone there
was no way to stop it. Rotation is now gated on the viewport being wide enough
to show the image and on the section being on screen at all. The 500ms crossfade
it promised never ran either: `key` remounts the image, and a brand new element
has no previous opacity to transition from, so it was a hard cut. It fades in
now.

Three star counters mount on the landing page in the same tick, and the GitHub
cache is only written once a response lands - so all three missed it and all
three fetched, against a limit of sixty requests an hour for an unauthenticated
IP. Callers now share a request that is already running.
