---
'frontend': patch
---

Delete the selection with the Delete key

Selecting files or folders and pressing Delete now does what the toolbar's
delete button does, confirmation dialog and all. A key that is quick to hit is
the last one that should skip the warning about a folder taking everything
inside it.

The listener is mounted by the multi-select toolbar and only while something is
selected, rather than sitting on the window for the whole session.

Four presses are deliberately left alone: a held key, which would otherwise
stack a confirmation per repeat; any modifier combination, which belongs to the
browser or the operating system; a press while typing in a field, since removing
a character in the search box must not remove the files behind it; and a press
while a dialog is open, which matters most for the confirmation this raises
itself, where it would let one press start the next delete.

Backspace is not bound. It is "go back" in too many places to take over for
something that cannot be undone.
