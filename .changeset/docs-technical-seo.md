---
'docs': patch
---

Give the docs site a robots.txt, a sitemap and canonical URLs

docs.opndrive.app now serves a robots.txt and a sitemap.xml listing every page,
built from the same content the site's pages are, so a new page is listed
without anyone adding it by hand. Each page names its canonical URL and its own
og:url, the share image resolves against the real domain instead of whichever
host built the site, and the home page title no longer reads "Opndrive
Documentation - Opndrive Docs".
