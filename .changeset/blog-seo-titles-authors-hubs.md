---
'frontend': minor
'docs': patch
---

Blog search titles and descriptions from Yoast, author pages and topic hubs

- **Whole descriptions.** A post's meta description, `og:description` and
  `twitter:description` are now its Yoast meta description in full. The blog
  used to cut every description to 152 characters and add "...". A post with no
  Yoast description falls back to its excerpt, cut at a word under 160
  characters, with nothing added.
- **Yoast search titles.** `<title>`, `og:title` and `twitter:title` are the
  post's Yoast SEO title. For a post with no custom title, Yoast builds one from
  its template, ending with WordPress's own site name; that ending is dropped.
- **The blog index describes the blog** as it is: guides to S3-compatible
  storage, CORS, presigned URL and signature errors, IAM, and self-hosting.
- **Author pages.** Each post's byline links to the author's page at
  `/blog/author/<slug>`, with their name, bio, links and posts, all from their
  WordPress profile. Posts by the Opndrive account are by the organisation: the
  post's structured data names the same Organization as author and publisher,
  and the author page is a ProfilePage about that Organization. A post by a
  person would name them as a Person.
- **Topic hubs.** A category with three or more published posts gets a page at
  `/blog/category/<slug>`: its description and its posts, newest first. The
  post's breadcrumb leads to it. A smaller category has no page and no link.
- **Sitemap.** Author pages and hubs are listed, and a post marked noindex in
  Yoast is left out.
