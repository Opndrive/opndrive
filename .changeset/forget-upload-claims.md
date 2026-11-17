---
'frontend': patch
---

Stop a folder being renamed because of one in another bucket

Uploading a folder reserves its name, so dropping a second one of the same name
is told the name is taken without asking the bucket again. That reservation was
never let go. It only records the folder's path, not which bucket the path was
in, so after switching bucket it still answered for the same path there: the
first "photos" dropped into a bucket that had never held one went up as "photos
(1)", with a notice saying a folder of that name was already here.

The reservations, and the notices about earlier drops, are now cleared whenever
the session changes - connecting, switching bucket or signing out - along with
the rest of what belonged to the bucket being left.
