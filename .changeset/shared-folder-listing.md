---
'frontend': patch
---

List a folder once per refresh, not twice

The folder view and the recent-items list are built from the same listing of the
same folder, and every refresh, after an upload, a new folder or a rename,
fetched that listing twice at the same moment. They now share one request when
they are refreshed together. A refresh asked for after another read had already
started still reads again, so it never shows what was there before the change it
was asked for.
