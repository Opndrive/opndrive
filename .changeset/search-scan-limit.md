---
'@opndrive/s3-api': patch
'frontend': patch
---

Stop a search for something that is not there from reading the whole bucket

Search reads at most 100,000 files per go before offering to continue. That
limit was counted in matches, not files read, so a search that matched nothing
never reached it and read the entire bucket in one go, however large. It now
counts files read. When nothing has matched in that slice, the page says "No
results yet" and offers **Keep searching**, rather than claiming there are no
results in files it has not looked at.

Matching folders are also no longer searched a second time (the search already
reads everything inside them), and "Load more" no longer appears for a search
that has finished. `search()` in the S3 API now also reports `scannedKeys`, how
many objects a page listed.
