---
'frontend': patch
---

Fix the blog index: a working call to action, honest empty states, real pages,
and every post listed

- **Get Started does something.** The blog index passed its call to action an
  empty server action, so the button did nothing. It is a link to /connect now,
  on the post pages too, so it works before the page hydrates and opens in a new
  tab on a middle click.
- **No "No blog posts available yet" under a featured post.** With one post, the
  index featured it and then said there were none. The "All blog posts" section
  now appears only when there are posts for it, and an empty blog says so once.
- **Pages are real pages.** `?page=1`, `?page=abc` and the like redirect to
  /blog. A page past the last answers 404 instead of an empty list. The featured
  post appears on page 1 only. Each page names itself as canonical, with its own
  title, where every page used to claim to be /blog.
- **Every post is listed.** The index asked WordPress for the newest 50 posts,
  bodies and all, so the 51st post and every one after it had no index page. It
  now asks for summaries without the body, a page of 100 at a time, so it can
  list every post for a fraction of the transfer. The RSS feed uses the same
  summaries.
- **/blogs redirects to /blog,** post paths and query strings included.
