---
'@opndrive/s3-api': patch
---

Upload the empty files in a folder passed to addFolderUpload

Both upload managers' `addFolderUpload` skipped every file of zero bytes with no
type, taking it for a folder. A folder picker lists files only, so what it
skipped were real files: a Python package's `__init__.py`, a `LICENSE`, a
`.gitkeep`. The folder arrived without them, and nothing said so.

Only the entry that dropping a folder onto a page adds is skipped now: it has no
path inside the folder and no type. A file with no path is keyed by its name,
where before it was written to the base prefix itself.
