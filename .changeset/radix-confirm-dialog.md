---
'frontend': patch
---

Replace the native `window.confirm` used for deletes with a themed dialog built
on the Radix alert-dialog primitive, covering the file menu, the folder menu and
multi-select delete. Also gives the advanced search sheet a dialog role, a name
from its heading, Escape handling from anywhere, and focus that moves into the
panel on open and back to the trigger on close.

Defines the `destructive` colour the shadcn primitives already referenced. It
was never in the palette, so `bg-destructive` generated no rule at all and the
confirm button rendered as white text on a white dialog.

Pins the dialog border to the theme's border colour. Tailwind v4 leaves a bare
`border` at `currentColor`, so both dialogs were outlining themselves in their
own text colour - a hard white rectangle in dark mode.
