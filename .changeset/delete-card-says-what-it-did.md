---
'frontend': patch
---

Make the delete card say what it deleted, and what it could not

Three things about that card were wrong, and the last one hid real failures.

The icon was hardcoded. Batch deletes set `type: 'folder'` to get _an_ icon, so
deleting a single photo drew a folder — and a selection of eight files drew a
folder too, sitting next to a label that correctly read "Deleting 8 files". The
icon is now read from the selection: one item gets its own name and icon, eight
JSON files get the JSON icon, and a selection with no one answer gets a stacked
one rather than picking a side. A folder saved as a real object — a zero-byte
key ending in a slash — counts as a folder here, because that is what it is to
the person looking at it.

The shared extension has to be carried on the card rather than read back off its
name, because a batch card is named "8 items" and there is no extension in that.
Deriving it from the name is what left the icon as a question mark, which reads
as an error rather than as eight files.

The card also names them now, behind an info icon beside the count: hovering it
lists the files one per line. "8 items" is true and useless — it does not tell
you whether the eight you selected are the eight you meant — but the names
inline truncate to "main - Copy - Copy (2).json, mai…", which spends a whole
line saying less than the count already did.

That list needed two things from the tooltip it borrows. `multiline` on its own
gives `white-space: normal`, which wraps but folds newlines into spaces, so a
list arrives as one run-on paragraph; there is a `pre-line` variant for it now.
And the tooltip measured itself with a class list that left out the caller's own
`className`, so it sized one element and rendered another — harmless while
nothing passed one, and wrong the moment anything did.

A finished delete was painted the same red as a cancelled or failed one, so a
green tick sat beside red text and a genuine failure was indistinguishable from
a success at a glance. It is muted now, like a finished upload.

And a failed delete showed no reason at all. `failDeleteOperation` sets the
status to `'failed'`, but the row only rendered a reason for `'error'` — a
status deletes never use. So the summary naming the objects that could not be
deleted was built, written to the store, and dropped at the last step. That
summary now reaches the card, and it names up to three failed objects with the
codes S3 gave, rather than only the first one.

None of this costs an extra request. S3 returns per-object failures inline in
the same `DeleteObjects` response that does the deleting; the information was
already in hand.
