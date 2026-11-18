---
'@opndrive/s3-api': patch
---

Retry only what is really a lost connection

Two kinds of failure were taken for a dropped connection, retried three times
over about 40 seconds, and while the browser said it was offline, waited on for
good:

- The uploader's own refusals, such as a file too large to upload, when the
  file's name happened to contain a word like "network" or "connection". They
  are now marked as the package's own (`name: 'UploadError'`) and never retried.
- Any `TypeError`, which is also what a bug in code throws. A `TypeError` now
  counts only when its message is a browser's word for a failed request: "Failed
  to fetch", "NetworkError when attempting to fetch resource", "Load failed", or
  Node's "fetch failed".
