---
'frontend': patch
---

Delete a folder and its contents, not just the marker

S3 has no directories. A folder is either inferred from a delimiter, which gives
it a `Prefix`, or written as a zero-byte object whose key ends in a slash. The
second kind is shaped exactly like a file - same type, same fields - and the
trailing slash is the only thing separating them.

Nothing recorded which was which, so every site that needed to tell them apart
invented its own test. Six of them, across twenty places, and they did not
agree. Delete was one of the places they disagreed.

The list of files to delete was built with a test that excluded markers. The
loop that then deleted them used one that did not, eleven lines further down. So
a folder stored as an object went to the file path: the marker was removed and
everything beneath it stayed - still stored, still billed, and no longer
reachable by a listing with no prefix left to find it under.

The loop was also an `if / else if` with no `else`. An item matching neither arm
fell through it silently, with the confirmation already accepted and the
selection already cleared, so the interface reported a deletion that never
happened. Anything that cannot be deleted now says so.

One module decides instead. `isFolder`, `isFolderMarker`, `isFile` and `itemKey`
live in `shared/utils/drive-item.ts`, and the twenty hand-rolled predicates are
gone along with the `as FileItem` and `as Folder` casts each of them needed -
every one a place the compiler had been told to stop checking.

Both types now carry a `kind` tag, set by the factory that builds them, rather
than leaving the answer to be inferred from which optional field happened to be
populated. It is optional, so anything restored from a cache written before it
still resolves through the structural test. The tag records the shape an item
was built as, which is not the same question: a marker is built by the file
factory and carries `kind: 'file'` while being a folder, so the marker test runs
before the tag is trusted anywhere it matters.

Selection identity is fixed with it. `itemKey` read the key, then the prefix,
then gave up and returned the empty string - so any two items carrying neither
collapsed into one, and selecting either showed both as selected. It reads the
`id` first now, which the factories always populate, and falls back to a
per-object identifier that is stable for one item and unique between two.

Selecting an item no longer takes a type from the caller. Components passed a
literal `'file'` or `'folder'` alongside it, and only the plain-click path read
it, so the same folder reported one thing when clicked and another when
ctrl-clicked. Every path derives from the item now, and the argument is gone
from all ninety-six call sites.

Also fixed on the way past: a folder stored as an object opened a file preview
when tapped on mobile, where that row had no such check at all.
