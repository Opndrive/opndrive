# Changelog
All notable changes to this project will be documented in this file.

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