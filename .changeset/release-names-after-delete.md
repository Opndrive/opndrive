---
'frontend': patch
---

Let a folder's name be used again after the folder is deleted

A folder uploaded during a session keeps its name reserved, so dropping a second
folder of that name uploads it as "photos (1)" rather than mixing the two.
Deleting the folder never gave the name back, so the next "photos" dropped after
the delete was still renamed, next to nothing at all of that name, until the
page was reloaded.

Deleting a folder now frees the names held at and below it. A name whose upload
is still running is kept, so files still arriving are never mixed with a new
folder's.
