---
'frontend': patch
---

Sort the file list by name from the list-view header. Ascending and descending
both sort case-insensitively with natural number ordering, since S3's own
listing order puts every capital before every lowercase. Descending is disabled
while a folder still has pages to load, because a partial listing cannot know
what belongs at the top. The choice is remembered between visits.

Also stops My Drive borrowing Home's language: the browse tree called its own
contents "Suggested files" and labelled the modified date "Last Opened", which
S3 does not record. Sections are named by the page showing them now.
