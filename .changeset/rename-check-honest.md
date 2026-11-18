---
'frontend': patch
---

Never rename a file over another because the check for one failed

Before renaming a file, the app checks whether something already has the new
name. If that check failed, because of a dropped connection, a refused request
or throttling, it was read as "the name is free", and the rename went ahead and
replaced whatever was there. A failed check now cancels the rename and says so,
as the check for folders already did.

When either check failed, nothing was shown at all: pressing Rename appeared to
do nothing. It now says it could not check the name and that the rename was
cancelled, and leaves the dialog open to try again.
