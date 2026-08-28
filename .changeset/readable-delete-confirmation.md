---
'frontend': patch
---

Make the multi-select delete confirmation readable, and warn about folders

Deleting a selection asked for confirmation with every name comma-joined and
quoted into one paragraph, and with no cap at all — so eight files arrived as a
run-on line to be parsed rather than scanned, and four hundred arrived as a
four-hundred-name wall. The body also opened by repeating the count the title
had just given.

The names are now listed one per line, capped at eight with the rest counted,
and folders keep a trailing slash — in a plain list that is the only thing that
says a name is a folder.

More importantly, it now says what a folder costs. The single-folder dialog has
always warned "and everything inside it"; this one said "5 items will be deleted
forever" and stopped, which gives no hint that one of those five might hold ten
thousand more. A selection containing a folder now carries that sentence, and a
selection of exactly one folder gets the same wording the overflow menu uses.
