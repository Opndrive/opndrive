---
'frontend': patch
---

Highlight the code in blog posts, and keep its lines whole

Code blocks in posts are now syntax highlighted, on the server, with Shiki: the
page arrives with the colours already in it and the browser loads no
highlighter. Each token carries the light and the dark colour, and the page's
theme picks one, so switching theme recolours the code instantly. Languages
Shiki has no grammar for, and plain text, keep their frame and copy button
without colours.

Long lines scroll sideways instead of wrapping into the next line, where the
indentation stopped meaning anything, and a keyboard can reach each block to
scroll it. Lines of code sit at a line height set for code rather than the
post's 1.8, which spread them almost two lines apart.

Underneath, a post's HTML is now parsed into a tree once and transformed there,
instead of being edited with regular expressions, and the result is kept per
version of the post's HTML in memory, so a post is highlighted once rather than
on every view, and any change WordPress sends is picked up.

None of this can cost a reader the post: without the highlighter the code is
framed and uncoloured, a block a grammar fails on stays as written, and if the
body cannot be rendered at all the page shows it as WordPress sent it.
