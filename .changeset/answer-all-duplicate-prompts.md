---
'frontend': patch
---

Answer every duplicate prompt at once instead of one file at a time

Dropping ten files onto ten that already exist raised ten identical questions,
one after another, each needing its own click. Nothing said how many were left,
so there was no way to tell whether answering meant one more click or nine.

The dialog now offers to apply the answer to everything still waiting, so ten
files take one click rather than ten. It also shows how many are left, which is
most of what made repeating the same answer feel endless.

Cancel used to skip a single file, which was not obvious with nine more behind
it. With a queue it now reads "Skip this one", and there is a "Cancel all"
beside it for abandoning a drop that went in wrong.

The bulk answer empties the queue before running the handlers rather than after,
so an upload that queues fresh work of its own raises a new prompt instead of
having it answered by the loop it was created inside.
