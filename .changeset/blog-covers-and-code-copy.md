---
'frontend': patch
---

Show blog covers whole, add copy buttons to code blocks, and stop wide tables
stretching posts on phones

Blog covers are drawn as 1200x630 cards with the title running close to both
edges, but the featured post sat in a box of a different shape, so
`object-cover` cropped the first letters off every line of its title. The cards
and the post header did the same to a lesser degree. Each box now takes the
shape of the picture it holds, so nothing is cropped and nothing is stretched.
The hover zoom is down from 5% to 2%, which stays inside the covers' margin.

Every code block in a post now has a header with its language and a copy button
in the top right corner. The button copies the code as text, without the
trailing newline that would run a pasted command straight away, and shows
"Copied" for two seconds. Where the clipboard is unavailable it selects the code
instead, so the keyboard shortcut still works.

Posts wrap their tables in a `table-wrap` region meant to scroll sideways, but
nothing gave it a scroll. A table with long inline code ran past the column, and
on a phone the whole page widened to fit it: 522px on a 390px screen, with every
line of the post zoomed out to match. The region scrolls now, and the page keeps
the width of the screen.
