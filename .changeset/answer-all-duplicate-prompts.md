---
'frontend': patch
---

Answer every duplicate prompt at once instead of one file at a time

Dropping ten files onto ten that already exist asked ten identical questions,
one after another, each needing its own click. Nothing said how many were left,
so there was no way to tell whether answering meant one more click or nine.

The dialog now offers to let the answer stand for every collision left in the
drop, so ten files take one click. It is honoured by the loop that raises the
prompts, in use-upload-dispatch, by not asking again. That loop awaits each
answer before the next question exists, so there is never a queue of prompts to
answer in bulk - which is the shape this looked like it had from the store.

The dialog also shows how many are left, which is most of what made repeating
the same answer feel endless.

Cancel used to close the dialog and resolve nothing, leaving the loop awaiting
an answer that never came: every file behind the cancelled one was never asked
about and never uploaded, and the drop stalled there in silence. Cancel is an
answer now. With more than one collision it reads "Skip this one", and a "Cancel
all" beside it abandons the rest of the drop. A file left alone this way gets a
notice saying so rather than the "could not find a free name" one, which was
about a different thing entirely.
