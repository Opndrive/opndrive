---
'@opndrive/s3-api': patch
'frontend': patch
---

Upload files larger than 48.8 GiB

Parts were always 5 MiB, and S3 allows at most 10,000 parts in one upload. A
file over about 48.8 GiB therefore uploaded for hours and then failed at part
10,001, leaving everything before it stored, billed and invisible.

`MultipartUploader` now picks the part size per file: the configured size, or
the smallest whole number of MiB that fits the file in 10,000 parts if that is
larger. A 60 GiB file goes up in 7 MiB parts. A resume works the size out the
same way, so its parts line up with the ones already uploaded.

A configured part size above S3's 5 GiB maximum is clamped to it, and a file too
large even for 10,000 parts of 5 GiB is refused before anything is sent.
