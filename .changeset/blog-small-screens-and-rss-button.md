---
'frontend': patch
---

Stop blog posts scrolling sideways on small phones, and drop the RSS button

- **No sideways scroll on small phones.** On screens narrower than 375px (320px
  and 360px phones), a post was 375px wide and scrolled sideways. The cause was
  text with no spaces in it: an endpoint URL in inline code, and
  "SignatureDoesNotMatch" in headings and the title, which could not wrap and
  ran past the column. Such strings now break where they have to, and section
  headings are a size smaller on phones, so a long name like that fits on its
  own line instead of being broken.
- **No RSS button.** The blog index and the end of each post showed an "RSS
  feed" button beside "Join our Discord". The feed stays at `/blog/rss.xml`, and
  every blog page still names it in its `<head>`, which is where feed readers
  look for it; only the button is gone. The end of a post now reads "Join the
  community".
