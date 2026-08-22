---
'frontend': minor
---

Give each S3 provider its own page and rebuild connect as an onboarding flow

/connect was blocked in robots.txt and served Loading as its entire body, so it
could not be indexed at all. It now renders real html and every provider has its
own route with its own title, heading, description and canonical, generated from
a single registry that also feeds the sitemap.

The page itself is now a focused flow: provider cards first, then one card per
provider with the logo, a back link, a searchable region combobox that fixes the
old height and scrolling bug, an accessible reveal toggle for the secret key,
and a connect button that sticks to the bottom.

Anything the list does not name is covered by a custom-endpoint provider at
/connect/custom-endpoint. That link previously went to /connect/minio, which
sent people on DigitalOcean Spaces or Scaleway to a page about self-hosting
MinIO. The hub also now points anyone wanting a provider added at the issue
tracker.
