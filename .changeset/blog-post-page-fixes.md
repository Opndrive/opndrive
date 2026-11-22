---
'frontend': patch
---

Fix the blog post page: visible related posts, one FAQ, lighter loading, calmer
images in the dark theme

- **"Relevant blog posts" is readable on the light theme.** Its heading was
  white, on a white page. "See all posts" used white text on the dark theme's
  light blue, which barely showed; it takes the theme's button text colour now.
- **One FAQ per page.** A post that ends with its own FAQ no longer has the
  product FAQ stacked under it. Posts without one keep it.
- **Related posts no longer fetch the post again.** Finding them fetched the
  current post twice more, with its whole body, before asking for the related
  ones. They now come from the post the page already has, as summaries without
  bodies, and load alongside the post's body rather than before it.
- **Pictures are dimmed a little in the dark theme,** with the contrast lifted
  so diagrams stay crisp: a white diagram used to sit on the dark page as a
  glaring slab. Pointing at one shows it at full strength.
- **Every table scrolls on its own.** Tables WordPress sends without the
  scrolling wrapper get one, so a wide table cannot widen the page on a phone.
