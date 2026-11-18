---
'@opndrive/s3-api': patch
'frontend': patch
---

Retry uploads that fail, by themselves and on request

An upload got one chance. A dropped connection, a few seconds offline or a busy
server failed it for good, and the only way to try again was to drop the file
again.

Both upload managers now retry a failure that may clear by itself up to three
times, 2, 8 and 30 seconds apart, and while the browser is offline they wait for
the connection to come back rather than spending a retry. A multipart upload
resumes its session, so the parts already sent stay sent. Refusals that will
only come back the same, such as a 403, are not retried. The delays can be set
with `retryDelaysMs`.

Signed-URL uploads also give up on a request that sends nothing for a minute.
Before, a connection that went quiet without failing left the upload hanging for
good.

An upload that still fails shows a Retry button in the upload panel, backed by a
new `retryUpload(id)` on both managers. For a folder it retries only the files
that failed.
