---
'@opndrive/s3-api': patch
'frontend': patch
---

Store uploaded files under their real content type

Multipart uploads sent no Content-Type, so S3 stored every file uploaded in the
default mode as `binary/octet-stream`. The app's own previews override the type
and hid this, but anything else reading the object saw only bytes: a shared link
to a photo downloaded it instead of showing it, and the details panel reported
every file as binary.

`MultipartUploader` now sets the type when it creates the upload, and on the
single request small files use. `UploadManager.addUpload`,
`SignedUrlUploadManager.addUpload` and `uploadMultipartParallely` take an
optional `contentType`. Without one they use the file's own `type`, as before.

The app passes the type the browser reports, or the one the file's extension
implies when the browser reports none, which is common for HEIC photos and some
video formats on Windows.
