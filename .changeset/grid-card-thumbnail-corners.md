---
'frontend': patch
---

Clip the grid card's thumbnail to the card's rounded corners

The card is `rounded-lg` but never clipped its children, and the thumbnail is a
square box sitting flush in the top two corners. So the radius only ever applied
to the background, and the thumbnail painted straight over the curve.

It was only obvious on files with an image preview, because those fill the box
edge to edge with an opaque photo, while a file without one gets a pale tint
that hides the same overflow. Selecting made it worse again: a selected card
draws a 2px outline, outlines follow `border-radius`, so a clean rounded corner
had two square image corners crossing it.

The grid skeleton has always drawn its placeholder with `rounded-t-lg`, so this
is the shape the card was meant to have all along.
