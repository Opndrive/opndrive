# File & Folder Management

## Renaming

**Files**: a single copy-then-delete against S3 (there's no native "rename"
operation in S3 - a rename is always a copy to the new key followed by a delete
of the old one).

**Folders**: renaming a folder means moving every object under its prefix, which
is riskier the more objects there are. Opndrive does this in three phases, in a
fixed order, specifically so a failure never leaves data in a half-renamed
state:

1. Copy every object to the new prefix.
2. Verify every expected object actually exists at the destination.
3. Only then, delete the old objects.

If anything fails during copy or verification, nothing is deleted - the original
folder is untouched, and it's safe to retry the exact same rename (re-copying an
object that's already been copied is a no-op). See
[S3 API Layer](../development/s3-api.md#renamefolder-copy-verify-delete) for the
implementation.

## Deleting

Single-file delete is a plain S3 delete. Deleting multiple files (or a folder's
contents) batches through a single `DeleteObjects` call per 1000 objects. S3 can
partially fail a batch delete (permission issues, retention locks on individual
objects) while still returning success for the request as a whole - Opndrive
checks the per-object results rather than assuming a 200 response means
everything was deleted.

## Searching

Search matches file and folder names (case-insensitive substring match) against
one page of S3 listing results at a time, using the same prefix-based pagination
as browsing. It's a name search, not a content search - S3 has no built-in way
to search file contents.

## Folder Navigation

Folders aren't a first-class S3 concept - a "folder" is really just objects
sharing a common key prefix, plus a zero-byte marker object at that prefix so
empty folders are visible. Breadcrumbs and browsing are built entirely from
prefixes, not from a real directory tree.
