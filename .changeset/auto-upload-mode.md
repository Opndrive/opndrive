---
'frontend': minor
---

Add an Auto upload mode that picks the method for each file

The upload setting had two choices, Multipart and Signed URL, and the right one
depended on file size, so a mixed drop always used the wrong method for some of
it. Auto, now the first option and the default for new installs, sends files
under 100 MB as one signed upload and files of 100 MB and up as multipart, the
size from which AWS recommends multipart. Large files can be paused; small ones
are cancel-only, as with Signed URL. Anyone who already chose a mode keeps it.

The settings also carried a second, unused "upload method" with an Auto option
that nothing read. It is removed, and dropped from stored settings on the next
save.
