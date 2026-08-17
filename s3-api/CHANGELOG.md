# Changelog

All notable changes to this project will be documented in this file.

## [3.0.0] - 2026-08-02

### Changed

- **BREAKING:** `MultipartUploadParams.partSizeMB` and
  `MultipartUploadConfig.partSizeMB` are renamed to `partSizeBytes`. The field
  was named MB but was always compared against a byte threshold, so passing `10`
  for "10 MB" silently gave 5 MiB parts instead. Renamed rather than
  reinterpreted, so anyone already passing bytes isn't silently affected.
  (`UploadManagerConfig.partSizeMB` is untouched and still means megabytes.)

## [2.8.0] - 2026-08-01

### Fixed

- Downloads: presigned GetObject URLs now set `ResponseContentDisposition` (RFC
  6266, with a UTF-8 filename fallback) so downloaded files keep their real
  filename instead of the bare S3 key basename.
- Download progress now reflects real streamed byte counts instead of a fake
  timed animation.
- Download cancellation now actually aborts the in-flight fetch instead of being
  a no-op after the browser had already taken over the transfer.
- Files over 2 GB skip in-memory streaming and hand off to the browser instead
  of risking a crashed tab from buffering into a `Blob`.
- Multi-select downloads are capped at 3 concurrent transfers instead of an
  unbounded fan-out.

## [2.7.0] - 2026-07-26

### Fixed

- `renameFolder` is now safe to retry after a partial failure. It previously
  copied and deleted one key at a time and threw on first error, which could
  leave a folder split across both prefixes with no record of where it stopped.
  It now does copy-all (concurrent, with retries) → verify → delete-all, so an
  interruption leaves the source intact and retryable.

## [2.6.0] - 2026-07-26

### Fixed

- Upload managers are now disposed on session/bucket change. `getInstance()`
  previously returned the first instance ever built and ignored later config, so
  switching buckets kept uploading to the previous bucket. Upload/delete history
  is also cleared on logout.

## [2.5.0] - 2026-07-26

### Fixed

- `deleteBatch` now reports per-object failures instead of discarding them.
  `DeleteObjects` returns 200 with a per-key `Errors` array, which was
  previously ignored, so partial deletes were reported as fully successful.
  `deleteBatch` now returns a `DeleteBatchResult` reflecting what actually
  survived.

## [2.4.0] - 2025-10-19

### Added

- Add singed url upload manager
- Supports file and folder uploads
- Uploads can be cancelled

## [2.3.1] - 2025-10-17

### Added

- Add isTruncated in the search results

## [2.3.0] - 2025-10-17

### Added

- Fixed search, now it returns files, folders and also updated search mechanism
  to match only the last term in files and folder keys

## [2.2.1] - 2025-10-5

### Added

- Fixed basePrefix logic in addFolderUpload (UploadManager)

## [2.2.0] - 2025-10-4

### Added

- UploadManager for files and folders implemented using queue

## [2.1.0] - 2025-10-3

### Added

- List all keys from a prefix and delete batch function

## [2.0.0] - 2025-09-30

### Added

- Add endpoint parameter to support other s3 compatible storage services like
  minio, cloudflare r2, etc.,

## [1.7.0] - 2025-09-30

### Fixed

- Fixed MultipartUploader class params and config

## [1.6.0] - 2025-09-30

### Fixed

- Removed auto start by multipart uploader

## [1.5.7] - 2025-09-30

### Fixed

- Removed uploadMultipart uploader function from the class

## [1.5.6] - 2025-09-15

### Fixed

- Fixed onProgress in multipart upload

## [1.5.5] - 2025-09-13

### Fixed

- Fixed upload multipart parallely to support concurrency param and partSize
  param, removed restore (used in browser crashes or unexpected events) as its
  support isn't fully decided

## [1.5.4] - 2025-09-13

### Fixed

- Fixed search results type to _Object instead of just string[] of keys

## [1.5.3] - 2025-09-13

### Fixed

- Fixed search param types

## [1.5.2] - 2025-09-13

### Fixed

- Fixed search param types

## [1.5.1] - 2025-09-13

### Fixed

- Fixed getSignedUrl function to allow browser preview

## [1.5.0] - 2025-09-11

### Added

- Search files or folders

## [1.4.0] - 2025-09-08

### Added

- File rename function
- Folder rename function

### Fixed

- tsconfig updated and resolved imports to use .js instead of .ts

## [1.3.1] - 2025-08-29

### Fixed

- Rexported the types from index.ts

## [1.3.0] - 2025-08-29

### Added

- Implemented getRegion, getPrefix and getRegion helper function to get bucket
  information.

## [1.2.0] - 2025-08-17

### Added

- Implemented deleteFile, moveFile, createFolder and deleteFile helper
  functions.

## [1.1.0] - 2025-08-17

### Added

- Support for uploading multiparts concurrently.
- MultipartUploader: support for `pause()`, `resume()`, and `cancel()` with safe
  handling.
- AbortController integration: in-flight part uploads are now aborted
  immediately when paused or cancelled.
- Resume deduplication: prevents duplicate parts and `EntityTooSmall` errors
  after resuming.
- Safety check: ensures only the last part can be <5MB.

## [1.0.1] - 2025-08-08

### Fixed

- Multipart uploads: avoid `getReader is not a function` in some
  bundlers/browsers. No API changes.

### Internal

- Prefer browser fetch path and reduce checksum wrapping for uploads.

## [1.0.0] - 2025-08-07

### Added

- Initial release.
