---
'frontend': patch
'@opndrive/s3-api': minor
---

Keep one listing per folder, and stop reading a folder once you leave it

The drive kept a folder's rows twice over (a listing, plus a sorted copy for the
home page's suggestions) with its request status spread across several maps.
Each folder now has one listing: its rows in S3's order, where S3 stopped,
whether the last page has arrived, the state of the first page and of the next
one, and where it was scrolled to. The home page's suggestions are read from
that same listing.

Coming back to a folder shows its rows at once and re-reads the first page
quietly. That re-read only replaces the rows it covers, so pages you had
scrolled to stay. A failed next page keeps every row above it and can be
retried. Leaving a folder cancels the request it still had open, and only one
request runs per folder at a time.

Listings are kept in memory only, for about the 20 most recently used folders or
200,000 entries, and are cleared on bucket switch and disconnect.

`BYOS3ApiProvider.fetchDirectoryStructure` takes an optional `{ signal }`, an
AbortSignal passed to the request, so a caller can cancel it.
