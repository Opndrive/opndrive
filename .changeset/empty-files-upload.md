---
'@opndrive/s3-api': patch
'frontend': patch
---

Upload empty files, and send small files in one request

Every file went up as a multipart upload, and a multipart upload needs at least
one part. An empty file has none, so S3 refused to finish it ("You must specify
at least one part") and the upload failed. Dropping a project folder failed on
every empty `__init__.py` and `.gitkeep` in it.

`MultipartUploader` now sends any file that fits in a single part as one
`PutObject`. Empty files work, and small files take one request instead of
three. Pausing one aborts the request and starting it again sends it again,
which for a single part is what a multipart resume did anyway.

Separately, the "Upload files" picker skipped empty files that had no extension,
such as `LICENSE` or `Makefile`, mistaking them for folders. It keeps them now.
