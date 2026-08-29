---
'frontend': patch
---

Let a failed download be dismissed instead of needing a page reload

A download that hit a network error wrote a row into the store that nothing
could ever remove, so both panels showing it were stuck until the page was
reloaded.

Three things were missing. The store gave `completed` and `cancelled` rows a
delay after which they clear themselves, but had no case for `error`. The
download card in the top right rendered its button only while a transfer was
running, so a failed row had no control on it at all. And the operations panel
in the bottom right mapped `upload` and `delete` to their remove actions and
never handled `download`, in both the row's own remove and the panel's close
button, while the panel only hides once its list is empty. So the close button
did nothing, however many times it was pressed.

An error now clears itself after 8 seconds, longer than a cancel or a completion
because it carries a reason worth reading, and the button on the card dismisses
the row once there is nothing left to cancel. The panel's close button goes
through the same remove action as the rows, so a kind of operation cannot be
handled in one place and forgotten in the other.

The three copies of "which statuses count as still running" are now one, and it
knows about downloads. They each listed upload and delete statuses only, so a
running download read as settled. That did not matter while the close button
ignored downloads, but it would have the moment it stopped: the button would
have dropped the row of a transfer still in flight rather than offering to
cancel it.
