---
'frontend': patch
---

Ask before closing the tab while an upload is still running

Closing or reloading the tab mid-upload ended the upload without a word, and a
multipart one left its parts in the bucket. Only a running delete asked first.

The browser now asks before leaving while any upload is queued, uploading or
paused, and while a dropped folder is still being read and checked. Finished,
failed and cancelled uploads do not hold the tab.
