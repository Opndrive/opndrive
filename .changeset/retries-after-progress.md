---
'@opndrive/s3-api': patch
---

Give a multipart upload its automatic retries back once it gets further

`UploadManager` retries a dropped connection up to three times, but counted
those retries over the whole upload. A big upload that met four short drops over
a few hours failed outright, though parts went up between every two, and the
parts it had sent were aborted with it.

The count now starts again whenever an attempt gets further than the one before,
so three retries in a row without progress still fail the upload. Signed-URL
uploads are unchanged: each attempt there sends the whole file again, so getting
further is not progress the next attempt keeps.
