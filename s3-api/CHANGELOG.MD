# Changelog
All notable changes to this project will be documented in this file.

## [2.3.1] - 2025-10-17
### Added
- Add isTruncated in the search results

## [2.3.0] - 2025-10-17
### Added
- Fixed search, now it returns files, folders and also updated search mechanism to match only the last term in files and folder keys

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
- Add endpoint parameter to support other s3 compatible storage services like minio, cloudflare r2, etc.,

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
- Fixed upload multipart parallely to support concurrency param and partSize param, removed restore (used in browser crashes or unexpected events) as its support isn't fully decided

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
- Implemented getRegion, getPrefix and getRegion helper function to get bucket information.

## [1.2.0] - 2025-08-17
### Added
- Implemented deleteFile, moveFile, createFolder and deleteFile helper functions.

## [1.1.0] - 2025-08-17
### Added
- Support for uploading multiparts concurrently.
- MultipartUploader: support for `pause()`, `resume()`, and `cancel()` with safe handling.
- AbortController integration: in-flight part uploads are now aborted immediately when paused or cancelled.
- Resume deduplication: prevents duplicate parts and `EntityTooSmall` errors after resuming.
- Safety check: ensures only the last part can be <5MB.

## [1.0.1] - 2025-08-08
### Fixed
- Multipart uploads: avoid `getReader is not a function` in some bundlers/browsers. No API changes.

### Internal
- Prefer browser fetch path and reduce checksum wrapping for uploads.

## [1.0.0] - 2025-08-07
### Added
- Initial release.