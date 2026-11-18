---
'@opndrive/s3-api': patch
---

Abort a resumed upload cancelled in the queue, and keep pathless files

- `UploadManager.cancelUpload` aborted the multipart session only of an upload
  that was uploading or paused. A resumed upload waits for a slot as "queued"
  with its session still open, so cancelling it there left its parts in the
  bucket. It is now aborted too.
- `addFolderUpload` skips a file with no path inside the folder only when it
  also has no type and no bytes, as before this release. Skipping every pathless
  file with no type dropped real files such as a `Makefile` without a word. A
  file with a path, however small, is always uploaded.
