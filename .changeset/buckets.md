---
'@opndrive/s3-api': patch
---

Add bucket create/delete and tagging APIs.

- `createBucket(bucketName)` - creates a bucket, handling the `us-east-1`
  location-constraint quirk automatically.
- `deleteBucket(bucketName)` - deletes a bucket. Never empties it first; returns
  `{ status: 'not-empty' }` instead of throwing if the bucket still has content.
- `getBucketTags`, `setBucketTags` (full replace), `addOrUpdateBucketTags`
  (merge), `removeBucketTags` (subtract) - full CRUD for bucket tags.
