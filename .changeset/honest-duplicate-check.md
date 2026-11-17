---
'@opndrive/s3-api': patch
'frontend': patch
---

Stop a failed duplicate check from passing as "no duplicate"

Dropping a file checks whether one of that name is already there, so you can be
asked before anything is overwritten. That check could not fail. It read an
object's metadata through `fetchMetadata`, which answers `null` for a missing
object and for every other problem alike, so a bucket that refused the lookup, a
throttled request and a dropped connection all came back as "nothing there". The
upload then went ahead and replaced the file without a word.

`@opndrive/s3-api` gains `objectExists(key)`, which treats a 404 as the only
"no" and throws for everything else. `fetchMetadata` is unchanged, and still the
right call for showing a file's details.

The upload check uses it, so a file that could not be checked is uploaded with a
notice saying so instead of silently. When that happens to a whole drop, which
is the usual case, it is said once rather than once per file. "Keep both" uses
it too: it used to take a failed lookup as proof that the original name was
free, and overwrite the file it had been asked to keep.
