---
'frontend': patch
---

Report a download in one place, and let a failed one be dismissed

A download that hit a network error left a row nothing could remove, so the
panel showing it stayed up until the page was reloaded. The store gave
`completed` and `cancelled` rows a delay after which they clear themselves but
had no case for `error`; the operations panel mapped `upload` and `delete` to
their remove actions and never handled `download`, in both the row's remove and
the panel's close button; and the panel only hides once its list is empty. So
the close button did nothing, however many times it was pressed.

A failed row also had no button on it at all. The row drew its trailing control
for active, then completed, then cancelled operations, and anything that had
gone wrong fell past all three to nothing - so the one row a reader most wants
rid of was the only one with nothing to press. That was true of failed uploads
and deletes too, and is fixed for all three.

Settled downloads now wait to be dismissed instead of clearing themselves. They
used to go on a timer, three seconds for a completion and two for a cancel,
which read as tidy until a failure needed the same treatment: a reason for a
failure that takes itself off the screen is no use to anyone who was not looking
at that moment, and the panel can be collapsed. Uploads and deletes have always
waited to be dismissed, and downloads now match them.

The same download was also announcing itself three times over: a toast, a card
of its own in the top right, and a row on the operations card in the bottom
right. The operations card is the one that stays, since it already carried every
status the separate card did, down to the queue position and the reason for a
failure. The separate card is gone, along with the toasts for starting,
cancelling and failing. One toast is left for a download that throws before the
service can record it, which leaves no row to read. The row now shows the
percentage while downloading, the only thing the removed card said that it did
not.

The three copies of "which statuses count as still running" are now one, and it
knows about downloads. Each listed upload and delete statuses only, so a running
download read as settled - which would have mattered the moment the close button
learned to remove downloads, since it would have dropped the row of a transfer
still in flight rather than offering to cancel it.
