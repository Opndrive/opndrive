---
'frontend': patch
---

Open a blog post's pictures larger, share a post, and see when it was updated

- **Pictures open larger.** Pressing a picture in a post, or pressing Enter on
  it, opens it over the page. A tall diagram keeps its size and scrolls rather
  than shrinking until its text is unreadable, and a small one is drawn up to
  twice its size. Escape or a press outside closes it, and focus goes back to
  the picture. The dialog's code loads the first time a reader opens a picture,
  not with every post.
- **Pictures load as they come near.** Every picture in a post's body is now
  loaded lazily and decoded off the main thread.
- **Share this post.** The end of each post has Copy link, X, LinkedIn, Hacker
  News and Reddit, plus the device's own share sheet where it has one. The share
  targets are plain links, so nothing from those sites loads on the page.
- **Updated dates.** A post changed on a later day than it was published says
  "Updated" with that date beside the publish date.
