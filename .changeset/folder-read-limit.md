---
'frontend': patch
---

Keep a dropped folder's reads within their limit of 16

Reading a dropped folder runs at most 16 file-system reads at once. When a read
finished, it gave up its place and woke the next read waiting, which only took
the place a moment later. A read arriving in that moment found the place free as
well, and both ran, so 17 could run at once. The place is now handed straight to
the read waiting for it.
