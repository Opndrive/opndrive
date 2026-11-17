---
'@opndrive/s3-api': patch
'frontend': patch
---

Stop the uploader writing your file names to browser storage

Every part of a multipart upload wrote an entry to `localStorage`, under
`upload:<file name>:<key>`, holding the file's name, its key, its size and the
id of the upload. It was there so an upload could resume. Nothing ever read it:
pausing and resuming work from what the uploader already holds in memory. An
upload that finished or was cancelled removed its entry, but one that failed, or
was still running when the tab closed, left it there for good.

It was also missing from the list of what we store in your browser, which the
privacy policy is generated from. The check that keeps that list honest reads
the app's source, and this write was in `@opndrive/s3-api`.

The uploader no longer touches browser storage at all, and a test in the package
now fails if anything in it does. As a side effect `MultipartUploader` no longer
needs a `localStorage` to exist, so it can be constructed in Node or a worker.
The app removes any entries an earlier version left behind the next time it
loads.
