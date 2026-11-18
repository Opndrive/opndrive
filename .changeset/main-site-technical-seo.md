---
'frontend': patch
---

Put every page's title, description and canonical in the head for Googlebot, and
stop the blog answering 500

Every page here renders per request, and Next.js was streaming each page's
metadata into the body for any visitor not on its short list of bots - Googlebot
included. Google only accepts a canonical in the head, so every canonical on the
site was being ignored. Metadata is now always in the head.

The blog: unknown posts return 404 instead of 500, /blog/rss.xml is a real feed,
the index and posts render on the server instead of "Loading...", and an empty
blog stays out of search and the sitemap until it has a post - while a WordPress
that cannot be reached leaves the blog indexed and listed. Post titles and
excerpts are plain text (no more `&#8217;` on the page or in the feed), dates in
metadata and structured data are exact UTC instants, the feed and sitemap really
are rebuilt hourly, and structured data cannot be closed early by a title.

Also: the hero image loads first and only the copy for the visitor's theme
downloads, also when the page is reached by client-side navigation and without a
hydration warning in development, the sitemap drops its build-time dates, the
home page names the site for Google, the connect pages keep their share image,
and the logo and divider art are a fraction of their old size.
