---
'frontend': patch
---

Create the empty folders in a drop, and empty folders dropped on their own

S3 has no folders, only file names, so a folder with nothing in it exists only
as a marker. Dropping an empty folder did nothing at all, and the empty folders
inside a dropped one, such as a project's `logs` or `cache`, never arrived.

Both are now created, the same way "New folder" creates one. An empty folder
whose name is already taken gets renamed like any other, and it shows in the
upload panel and finishes like any other folder. This works for drag and drop
only: the folder picker never tells the page about empty folders.
