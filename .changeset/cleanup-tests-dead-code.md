---
'frontend': patch
---

Remove the unused second Notification component, and make batch delete refuse
folders

The notification shown on screen keeps its "Close notification" tooltip, taken
from a second copy of the component that nothing rendered; that copy is gone.
Deleting several files at once now refuses a folder outright instead of counting
it in the progress card and then not deleting it. Nothing in the app sends it
one; folders keep their own delete, with progress and recovery.
