# S3 API Layer

`@opndrive/s3-api` is the workspace package that does every S3 operation
Opndrive performs. It is also publishable to npm for external consumers. The
frontend never talks to `@aws-sdk/client-s3` directly - everything goes through
this package. This page documents the real exported surface, read from
`s3-api/src/`.

## Shape of the Package

```
BaseS3ApiProvider   (s3-api/src/core/index.ts)   - abstract class, owns the S3Client
        ↑ extends
BYOS3ApiProvider    (s3-api/src/index.ts)        - concrete implementation
```

`BaseS3ApiProvider` constructs the `S3Client` from the credentials it's given
(access key, secret, region, bucket, and an optional custom `endpoint` for
S3-compatible services like MinIO - setting `endpoint` also forces path-style
addressing). It sets `maxAttempts: 5` on the client and nothing else retries on
top of that: the SDK's own retry strategy already handles throttling and 5xx
errors with backoff, so a second retry layer around individual calls would
multiply requests rather than help.

## Public API (`BYOS3ApiProvider`)

| Method                                                              | What it does                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| `fetchDirectoryStructure(prefix, maxKeys, token?)`                  | Paginated listing, split into `files` and `folders`           |
| `fetchMetadata(path)`                                               | `HeadObject`; returns `null` on 404 rather than throwing      |
| `uploadWithPreSignedUrl(params)`                                    | Single-request presigned PUT URL                              |
| `uploadMultipartParallely(params)`                                  | Returns a `MultipartUploader` for large files                 |
| `getSignedUrl(params)`                                              | Presigned GET URL, with an inline-preview mode                |
| `downloadFile(params)`                                              | Streams a GET body to `Buffer`/`Blob` with progress callbacks |
| `deleteFile(key)`                                                   | Single-object delete                                          |
| `deleteBatch(batch)`                                                | Up to 1000 objects per call - see below                       |
| `listFromPrefix(prefix)`                                            | Exhaustive, paginated key listing under a prefix              |
| `moveFile(params)` / `renameFile(params)`                           | Copy + delete for a single object                             |
| `renameFolder(params)`                                              | Bulk rename - see below                                       |
| `createFolder(key)`                                                 | Writes a zero-byte object as a folder marker                  |
| `search(params)`                                                    | Client-side name matching over one listing page               |
| `getBucketName()` / `getPrefix()` / `getRegion()` / `getS3Client()` | Accessors                                                     |

### `deleteBatch` and the `Errors` array

S3's `DeleteObjects` returns HTTP 200 even when individual keys fail
(permissions, retention locks). Those failures come back in a separate `Errors`
array rather than as a thrown exception. `deleteBatch` surfaces this directly as
`{ requested, deleted, errors }` - callers must check `errors` before treating a
batch delete as fully successful.

### `renameFolder`: copy-verify-delete

Renaming a folder means moving every object under a prefix. `renameFolder` does
this in three phases, in this order, specifically so a failure at any point
leaves the source **fully intact**:

1. **Copy** every key to the new prefix (bounded concurrency, one `CopyObject`
   per key). Nothing is deleted yet.
2. **Verify** every expected key actually exists at the destination - comparing
   the real key set, not just a count, because a partially pre-populated
   destination could otherwise mask missing copies.
3. **Delete** the old keys, batched through `deleteBatch`, only after
   verification passes.

If copying or verification fails, the function returns `status: 'failed'` with
the source untouched - safe to retry with the same arguments, since re-copying
an already-copied key is a no-op. If deletion partially fails after a successful
copy+verify, it returns `status: 'copied-not-cleaned'`: the rename itself
succeeded (the data is complete and correct at the new name), and what's left is
a cleanup problem, not a failed rename.

## Upload Managers

`UploadManager` (multipart) and `SignedUrlUploadManager` (presigned) are both
exported singletons: `getInstance(config)` returns the same instance across
calls and **ignores the config argument once an instance already exists**. That
makes `disposeInstance()` a required call whenever a session ends or the
connected bucket changes - without it, in-flight and new uploads keep targeting
the previous session's bucket and credentials.

## Concurrency Helper

`forEachWithConcurrency(items, concurrency, worker)`
(`s3-api/src/utils/concurrency.ts`) runs a worker over a list with at most
`concurrency` in flight, pulling from a shared cursor rather than materializing
one promise per item. `renameFolder`'s copy phase uses this to stay bounded on
folders with very large object counts.

## Consuming It

```typescript
import { BYOS3ApiProvider } from '@opndrive/s3-api';

const api = new BYOS3ApiProvider(credentials, userType);
const { files, folders } = await api.fetchDirectoryStructure('photos/', 50);
```

See [Connecting Storage](../guides/connecting-storage.md) for how `credentials`
gets built from the `/connect` form, and
[Release Process](../maintainers/release-process.md) for how this package gets
versioned and published.

## Testing It

The listing, metadata, and single-object methods above
(`fetchDirectoryStructure`, `fetchMetadata`, `listFromPrefix`, `search`,
`uploadWithPreSignedUrl`, `getSignedUrl`, `downloadFile`, `deleteFile`,
`deleteBatch`, `createFolder`) are covered by unit tests that mock the AWS SDK,
so `pnpm --filter @opndrive/s3-api test` needs no credentials and makes no
network calls.

The rename/move family, `uploadMultipartParallely`, the accessors, the upload
managers, and the uploaders are covered too, and CI enforces coverage thresholds
on this package. See [Testing](./testing.md) for the full inventory plus the
mock patterns and conventions.
