---
'@opndrive/s3-api': patch
---

Stop a multipart upload paused and resumed mid-request from being sent twice

`pause()` aborts every part in flight, but three requests cannot be aborted part
way: opening the session, listing its parts, and completing it. A pause and
resume while one of those was out started a second run beside the first, both
driving the same `MultipartUploader`. Parts went up twice, a second session was
opened and left behind, or a completed upload was resumed and marked failed.

`MultipartUploader` now runs one `start()` or `resume()` at a time: the second
waits, and the first stops as soon as its request comes back. A run paused
before its turn sends nothing. A session that opens after the upload was
cancelled is aborted instead of left open, and a completed upload is not
"aborted" by a late cancel.
