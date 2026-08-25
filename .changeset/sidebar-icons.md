---
'frontend': patch
---

Size the sidebar nav icons on the icon rather than on a box around it

The size classes sat on a wrapper `div` and the icon inside was given none.
`react-icons` default to a width and height of `1em`, so the icon inherited the
row's `text-sm` and drew at 14px inside a slot reserved for 20. It looked
misaligned for the same reason: Tailwind's preflight makes an svg
`display: block`, so those 14px sat in the top left corner of the 20px box. The
row centred the box, and nothing centred the icon inside it.

The size is on the icon now and the wrapper is gone. The row is already
`flex items-center`, so a direct child is centred by the row itself and there is
no intermediate element left to get it wrong. Icons are 20px against a 14px
label, which is the usual pairing, and 16px for a nested item.
