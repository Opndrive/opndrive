---
'frontend': patch
---

Say why an upload failed

A failed upload's row only ever said "Failed". The reason the upload manager
gave was dropped twice on its way to the panel: the event handler kept just the
status and progress, and the panel never passed a reason to an upload's row even
when it had one. A key without permission and a dropped connection looked the
same, though only one of them is worth retrying.

The row now shows the reason, such as "Access Denied". A folder shows its own
reason when it could not start at all, and otherwise the reason of the first of
its files that failed. Retrying clears it.
