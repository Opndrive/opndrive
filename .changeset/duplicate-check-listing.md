---
'frontend': patch
---

Check a big drop for duplicates with one listing instead of a request per file

Before uploading loose files, each one was checked for an existing file of the
same name with a request of its own, five at a time. Dropping 500 files meant
500 requests and a long wait before the first byte moved.

A drop of more than five files is now checked against a listing of the
destination, which covers up to a thousand files per request. The listing reads
only as many pages as the per-file checks would have taken rounds, so it is
never the slower of the two, and whatever it could not rule out in that budget
is still checked one by one. A name is only treated as free once it has really
been checked, so nothing is overwritten by guesswork.
