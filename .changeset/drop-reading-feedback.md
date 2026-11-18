---
'frontend': patch
---

Show that a dropped folder is being read, and read it faster

Dropping a large folder showed nothing at all until its first upload started.
The folder was being read from disk one file at a time, then checked against the
bucket and planned, and for all of that the page looked as if the drop had been
missed.

The upload panel now opens straight away with "Reading dropped files…" and a
count of the files found so far, then "Getting ready to upload…" while the drop
is checked. The files of a folder are read several at a time instead of one
after another, in the same order as before. The browser also asks before closing
the tab while a drop is still being prepared.
