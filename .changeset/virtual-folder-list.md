---
'frontend': minor
---

Large folders scroll smoothly in list view. The list draws only the rows near
the screen, reads the next page of S3 results as you scroll towards it instead
of behind two buttons, and keeps your place when you come back to a folder. The
count reads "N+ items" until the last page is in, a page that fails to load
becomes a retry row, and a folder found on a later page joins the folders
without moving what you are looking at.
