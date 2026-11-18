---
'frontend': patch
---

Use the theme's warning and error colours for an upload row's status

An upload row said "Paused" in `#f59e0b` and "Failed" or "Upload cancelled" in
`#ef4444`, fixed colours that read at 2.1:1 and 3.8:1 on a white panel and did
not follow the dark theme. They now use `--warning` and `--destructive`, like
the upload notices.
