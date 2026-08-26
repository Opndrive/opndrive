---
'frontend': patch
---

Keep the layout toggle still, and show the landing page's artwork in the right
theme

**The list/grid toggle no longer moves when you use it.** It lived in the file
table's heading in both layouts, and in grid view that heading sits below the
entire folder grid - so clicking "grid" dropped the control a whole section's
height, out from under the pointer that had just clicked it, and clicking "list"
threw it back up. Whichever section leads the page owns it now: the folders
heading in grid, the table in list. Both start at the same offset and hold the
same row height, so the control stays where it was put.

An empty directory keeps the toggle too. That branch of the table rendered no
heading row at all, so opening an empty folder in grid view left no way back to
list until you navigated somewhere with contents in it.

**The landing page's screenshots follow the theme again.** A visitor in dark
mode got the light artwork until they toggled the theme twice.

The src was picked in JavaScript from the resolved theme. The server cannot know
the theme, so it rendered the light one - and React keeps a server-rendered
attribute through hydration rather than patching it. The client then computed
the right theme, found it already matched what it was holding, and never
re-rendered, so the light image stayed. Toggling forced a real render, which is
why that appeared to fix it. Nothing was wrong before the landing page began
server-rendering; it only had no server HTML to be stuck with.

Both images ship now and CSS paints one, the same way every colour on the page
is already chosen - `data-theme` is stamped on the document before first paint,
so the right one is the only one ever drawn. Only one is fetched: the other is
`display: none`, so lazy loading never asks for it.

That last part costs the hero image its preload hint, since preloading ignores
`display` and would pull both. It is in the opening viewport either way. The two
rotating feature sections lose a `priority` they should never have carried -
they sit below the fold and behind a `lg` breakpoint, so it was preloading
offscreen images on every visit.
