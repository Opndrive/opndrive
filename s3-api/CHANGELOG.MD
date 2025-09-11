# Changelog
All notable changes to this project will be documented in this file.

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