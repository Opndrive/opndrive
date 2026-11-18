---
'frontend': patch
---

Stop counting a finished folder upload as one still running

Before switching bucket or signing out, the app counts the uploads still running
so it can say what would be cancelled. It counted each folder's own card as well
as its files, and a folder's card is never moved on from "queued", since the
panel works a folder's status out from its files. Every folder uploaded in a
session left one "upload" in that count for good, so the warning came up, and
named work that was not there, until the panel was cleared.

The count now takes files only, by the same rule the "leave site?" prompt uses.
