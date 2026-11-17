---
'@opndrive/s3-api': patch
'frontend': patch
---

Rename and move files over 5 GB

S3 copies at most 5 GB in one request, and renaming or moving a file is a copy
followed by a delete. Renaming a large video or disk image failed outright, and
so did renaming any folder that held one.

Files over 5 GB are now copied in parts, all on S3's side, so nothing passes
through the browser. The copy keeps the file's type and its other details, every
part is taken from the same version of the file, and a copy that fails part way
is cleaned up. Files up to 5 GB are copied exactly as before.
