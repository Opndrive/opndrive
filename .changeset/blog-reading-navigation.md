---
'frontend': patch
---

Find your way around a long blog post: a table of contents, section links,
reading progress and back to top

- **On this page.** Beside the post on wide screens, a list of its sections
  stays in view and marks the one being read, opening that section's subsections
  under it. On narrow screens it is a closed "On this page" panel above the
  post, which closes again once a section is picked. Posts with fewer than three
  sections go without one.
- **Every section has a link.** Each heading's text links to its own section,
  and pressing it copies the address, with a short "Link to this section copied"
  note. A link icon shows while a heading is pointed at or focused. Headings
  keep their names for screen readers, and headings without an id get one from
  their text.
- **Reading progress.** A thin bar across the top of the window fills as the
  post is read.
- **Back to top.** Once the reader is well into the post, a button takes them
  back to the top and moves keyboard focus to the title.

The sidebar's call to action stays under the list, and its title is no longer a
heading that sat between the post's title and its first section.
