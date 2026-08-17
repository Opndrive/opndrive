---
'frontend': patch
---

Replace the native `window.confirm` used for deletes with a themed dialog built
on the Radix alert-dialog primitive, covering the file menu, the folder menu and
multi-select delete. Also gives the advanced search sheet a dialog role, a name
from its heading, Escape handling from anywhere, and focus that moves into the
panel on open and back to the trigger on close.
