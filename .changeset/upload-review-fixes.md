---
'@opndrive/s3-api': patch
---

Make pause, cancel and retries of a multipart upload hold up under a bad network

- **A pause now aborts every request**, not only the parts. Opening the session,
  listing its parts and completing it were left running, and with one run at a
  time, a resume waited behind a request that, on a half-open connection, never
  answered. A completion aborted this way is asked about again on resume.
- **A cancel that arrives while S3 is completing the upload lets it finish.**
  Cancelling then only raced the completion, and when the completion won, the
  file was stored under an upload reported as cancelled. A direct `cancel()`
  that finds the session gone after a completion was sent now says the file may
  already be stored, rather than succeeding quietly.
- **Retries are not given back while the same part keeps failing.** Other parts
  going up is progress, but a part that fails every time is stuck however often
  they do. `MultipartUploader.failedPart` names the part that ended an attempt.
- **A completion S3 has definitely answered is not asked about again.** Once the
  object has been looked at and is not this upload, the session is let go of,
  and a later `start()` begins afresh.
