---
'frontend': patch
---

Update the listing in place after a file operation, instead of re-reading it

Every operation used to finish by calling `refreshCurrentData`, which re-lists a
whole prefix twice - once for the directory and once for the recent items, each
up to a thousand objects. It always re-read the prefix the user was standing in,
whatever prefix the operation had actually touched, so dropping files into a
folder from outside it re-listed the wrong folder and left the right one stale.
Deleting several files paid for that round trip once per file, in series.

The drive store now edits the rows it already knows changed. `removeFiles`,
`addFile`, `addFolder`, `renameFile` and `renameFolder` rewrite the affected
listing - and the recent list behind it, offsets included - and each returns the
inverse of what it did, so an operation whose request then fails puts back what
it took and nothing else. Uploads carry the key, size and destination they
landed at, so a finished one adds its own row rather than asking where the user
happens to be.

A re-read still happens where the outcome is genuinely unknown - a partly failed
batch delete, a folder rename that left copies behind - but silently: it does
not announce itself as loading, and a failure no longer replaces rows that are
still on screen with an error notice.
