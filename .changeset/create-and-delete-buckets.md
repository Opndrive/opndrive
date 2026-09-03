---
'frontend': patch
---

Make and remove buckets from the bucket switcher

The switcher could only move you between buckets that already existed. Its
footer offered a box for typing a bucket name, which helped only if you already
had one. That is now "New bucket", and it makes one.

The name is checked against S3's actual rules as you type, so a name it would
refuse is refused here first, with the rule that was broken rather than an
`InvalidBucketName` error that names nothing. A dot is allowed but warned about,
since it breaks HTTPS for some tools.

You can pick the region, but only where the choice is real. On AWS the client is
built for the region you choose, because S3 refuses a bucket whose location does
not match the endpoint the request reached. Every other provider stores an
endpoint of its own, and that URL decides the location - so there the region is
named rather than offered.

Each bucket in the list can also be deleted, except the one you are working in,
which would leave the session pointing at nothing. Deleting asks first. S3 only
removes empty buckets, so a bucket with anything still in it is reported as such
rather than emptied for you.

Creating and deleting update the list in place instead of listing your buckets
again, since listing them is a billed request and the answer is already known.
