---
'@opndrive/s3-api': patch
'frontend': patch
---

Stop a cancelled upload from starting the uploads behind it

Cancelling a folder mid-upload cancels its files one after another, and for the
whole of that pass the queue is still full of files that are about to be
cancelled too. `cancelUpload` pumped the queue on its way out, which handed the
slots the running uploads had just given up straight to them: each one started,
a `CreateMultipartUpload` and a CORS preflight apiece, moments before its own
cancellation arrived. Cancelling 3000 files fired off 1498 uploads it then had
to abort. The pump is deferred by a microtask now, so it runs after the caller
has finished cancelling and only work nobody cancelled is left to start.

Half of those doomed uploads were also leaked. `MultipartUploader.cancel()`
aborts the session S3 has open, but only if it has an upload id yet - and these
were cancelled while `CreateMultipartUpload` was still in flight, so it had
nothing to abort and returned. The id arrived a moment later with nobody left to
use it, leaving an incomplete multipart upload in the bucket that no listing
shows and nothing ever closes, billed until a lifecycle rule expires it.
`start()` now sends that abort itself, and skips the create entirely when the
cancel got there first.

The freeze itself was mostly somewhere else. Every one of those events was
written into the upload store on its own, and each write copied the whole record
and woke every subscriber, so a cancelled folder cost N copies of an N-entry
object. Measured over 3000 files that was 9.3 seconds of blocked main thread.
Manager events are now collected per tick and applied in one write: the same
3000 files take 9ms. Progress ticks during an ordinary upload go the same way.
