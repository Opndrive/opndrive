---
'@opndrive/s3-api': patch
'frontend': patch
---

Stop a failed upload in its tracks, and clean up after it

When one part of a multipart upload failed, `start()` rejected straight away but
the other workers carried on: they sent every remaining part of an upload that
had already been reported as failed. And nothing ever aborted it, so the parts
it did send stayed in the bucket for good, billed and missing from every
listing.

`MultipartUploader` now stops the other workers on the first failure, aborts
what they have in flight, and rejects only once nothing is still running. It
keeps its session, so a caller can still `resume()`.

`UploadManager` never resumes a failed upload, so it now aborts the multipart
upload on the server before letting go of it. If that abort cannot get through
either, it says so in the console rather than failing twice.

A closed tab still gives the page no chance to clean up, so the setup guide on
each connect page now points to the lifecycle rule that does it.
