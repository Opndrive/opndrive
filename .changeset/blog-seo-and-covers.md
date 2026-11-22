---
'frontend': patch
---

Give every blog post a cover and a share image, describe posts better to search
engines, and add /llms.txt

- **A cover for every post.** A post without a cover of its own gets one drawn
  from its title with `next/og`, in the style of the covers made by hand - the
  Opndrive mark, the category, the title in Inter Bold, the blog's address - at
  `/blog/<slug>/cover.png`. It is the post's share image and its picture on the
  blog. Posts with a cover keep theirs.
- **Structured data, tidied.** Each post is described once, as a BlogPosting,
  where it was also described as an Article whose author linked to an /about
  page that does not exist. The author is the organisation when the post is
  published under the Opndrive account. Word counts and reading times count the
  text's words, not words run together across tags. A post's own FAQ section is
  described as an FAQPage, and the blog index lists the posts it shows.
- **Follow the blog.** The index and the end of every post link to the RSS feed
  and to the Discord community. Post pages also advertise the feed in their
  head.
- **A way back.** Posts have a Home / Blog breadcrumb above the title, matching
  the one in their structured data; a post without related posts had no link to
  the blog at all.
- **/llms.txt.** A short Markdown map of the site for language-model tools: what
  Opndrive is, the provider guides, the docs, and every blog post, rebuilt
  hourly like the feed.
