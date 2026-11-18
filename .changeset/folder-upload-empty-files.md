---
'@opndrive/s3-api': patch
---

Upload the empty files in a folder passed to addFolderUpload

Both upload managers' `addFolderUpload` skipped every file of zero bytes with no
type, taking it for a folder. A folder picker lists files only, so what it
skipped were real files: a Python package's `__init__.py`, a `LICENSE`, a
`.gitkeep`. The folder arrived without them, and nothing said so.

A file with a path inside the folder is now always uploaded. A file without one
is skipped only when it also has no type and no bytes, as before: that is the
entry dropping a folder onto a page adds. A file with no path is keyed by its
name, where before it was written to the base prefix itself.
