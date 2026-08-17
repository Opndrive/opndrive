---
'frontend': patch
---

Put the open file preview in the URL. Opening a preview now adds a `preview`
query parameter to the current page, so Back closes it instead of leaving the
folder, and a preview can be linked, bookmarked and reloaded. Arrowing between
files replaces the entry rather than pushing, so a long browse does not bury the
folder. The separate `/dashboard/preview/[etag]` page is retired to a redirect
and "Open in new tab" points at the modal URL, keyed by S3 key so a shared link
survives the file being re-uploaded.
