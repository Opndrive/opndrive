---
'frontend': patch
---

Report a download in one place instead of three

A single download announced itself three times over: a toast, a card of its own
in the top right corner, and a row on the operations card in the bottom right.
All three said the same thing, and the two cards sat in opposite corners showing
the same transfer at the same time.

The operations card is the one that stays. It already listed downloads beside
uploads and deletes, with the same file icon, the same progress ring drawn in
its own blue, the same cancel on hover, and it already carried every status the
separate card did, down to the queue position and the reason a download failed.

So the separate download card is gone, and with it the toasts for starting,
cancelling and failing. One toast is left, for a download that throws before the
service can record it: there is no row on the card in that case, and staying
quiet would lose the failure entirely.

The row now shows the percentage while downloading, which is the only thing the
removed card said that the row did not. Uploads keep the display they had.
