---
'frontend': patch
---

Sort the file list by name from the list-view header. Ascending and descending
both sort case-insensitively with natural number ordering, since S3's own
listing order puts every capital before every lowercase. Descending is disabled
while a folder still has pages to load, because a partial listing cannot know
what belongs at the top. The choice is remembered between visits.
