---
'frontend': patch
---

Show running uploads as uploading from the moment their cards appear

The upload manager starts the first few files of a drop while it is still being
handed them, before their cards exist, so the event saying so went nowhere.
Those cards said "Queued" while their files were uploading, until the next event
for each came along, which for a small file was "Completed".

A card now starts from the manager's own account of where its upload is.
