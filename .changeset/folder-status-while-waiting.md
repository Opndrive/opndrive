---
'frontend': patch
---

Keep a folder showing as uploading while its files still wait their turn

A folder's card showed "failed" as soon as some of its files had failed and none
had finished, even with the rest still waiting to start. That happens when the
first files fail together, before any other has a turn. The card then offered
"Remove from list" instead of Cancel, and removing it took away the cards of the
files still to upload: they went on uploading with nothing showing them.

A folder with files still waiting now shows as uploading once any file before
them has finished, whether it landed or failed, and as failed only when nothing
is left to run.
