---
'@opndrive/s3-api': patch
'frontend': patch
---

Delete big folders faster, by deleting while they are still being listed

Deleting a folder listed every file in it first, a thousand per request, and
only then started deleting, one batch of a thousand at a time. A folder of
100,000 files sat through 100 listing requests before anything went, then 100
deletes in single file.

Each batch of a thousand is now deleted as soon as it has been listed, with up
to four batches at once. The folder itself still goes last, only after
everything in it, so an interrupted delete never leaves files without a folder
above them. Cancelling, signing out and a failed batch all stop new batches
going out and wait for the ones already sent before reporting.

The S3 API gains `listPagesFromPrefix`, which hands over a prefix's keys a page
at a time as each arrives.
