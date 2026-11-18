---
'@opndrive/s3-api': patch
---

Stop marking a stored upload failed when the reply to its completion is lost

S3 can store a multipart object and the reply to `CompleteMultipartUpload` never
arrive. The retry resumed the upload: it asked S3 for the parts of a session
that no longer existed, got `NoSuchUpload`, and the upload was marked failed
over a file that was stored. Retry then sent the whole file again.

A completion that got no answer, or a 5xx, is now asked again before anything
else. When S3 says the session is gone, the object under the key is checked: if
its ETag is the one S3 gives an object made of exactly these parts, the upload
is done. Otherwise it fails, saying the file was not stored, or that it could
not be confirmed (as under SSE-KMS, where a part's ETag is not its MD5).
Aborting a session that is already gone is no longer reported as parts left in
the bucket.
