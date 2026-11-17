---
'frontend': patch
---

Keep the page responsive while uploading thousands of files

Every change to an upload card copied the whole list of cards and redrew the
upload panel, and a drop sent several changes per file. The cost grew with the
square of the drop: on one test machine, 4,000 files took 2.7 seconds of frozen
page just to show their cards and 5.5 seconds for each round of progress.

A drop's cards are now added in one go, and the upload manager's events reach
the cards in batches, ten times a second. For the same 4,000 files, showing the
cards takes under a millisecond and a round of progress costs about 1.4
milliseconds per batch. A folder is checked for completion once per batch
instead of once per finished file, the panel works out a folder's status in one
pass over its files instead of up to eight, and closing the panel clears every
card in one go. Removing a folder card now removes its file cards too, rather
than leaving them behind to slow down every later drop.
