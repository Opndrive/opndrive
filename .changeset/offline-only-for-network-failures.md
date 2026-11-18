---
'@opndrive/s3-api': patch
---

Wait for the network only when a failure looks like a lost connection

While the browser said it was offline, any upload failure without an HTTP status
was taken for the network's, and waited on: tried again every 30 seconds for as
long as the browser stayed offline, only to fail the same way once it came back.
That included failures of the upload's own, such as a file too large to upload,
which are thrown before anything is sent.

A failure now counts as the network's only when it also looks like a lost
connection, by the same rules that decide whether a failure is worth retrying.
