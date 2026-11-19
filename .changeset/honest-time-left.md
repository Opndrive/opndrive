---
'frontend': patch
'docs': patch
---

Show upload time left from the real upload speed, or not at all, and remove the
advanced search sheet

The time left on uploads was made up. The speed it used was a random number
between 0.5 and 2 MB/s, and since upload cards carried no sizes it fell back to
a formula on the progress bar, so a folder at 10% said "6 min left" on any
connection and counted down with the bar however long that took. It is now
measured from the bytes the files have actually sent over the last 45 seconds,
across every file still to go, and shown as "About 25 min left". Until there is
enough to measure, and while uploads are paused or waiting for the network, the
panel shows no time at all instead of a guess. Deletes no longer show
"Calculating time..." that never resolved.

Files a large upload could not read are now one notice per reason, such as "150
items could not be read and were not uploaded", instead of a line for every
file. "Show files" lists them grouped by folder, and "Copy list" copies every
path.

The advanced search sheet, its filter bar and the dropdown it used are gone.
None of them were shown anywhere, the Search button discarded every filter, and
nearly all of the fields (owner, shared drives, starred, encrypted, approvals,
shared to, words inside files) have no equivalent in S3.
