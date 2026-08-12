# Changelog

Notable changes to the Opndrive frontend app. `s3-api` has its own
[CHANGELOG](./s3-api/CHANGELOG.MD) since it's versioned and published
separately - see
[Release Process](./docs/content/maintainers/release-process.md).

This file starts now; changes before this point aren't backfilled. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [2.2.0] - 2026-08-13

### Added

- Upload executor that bridges planned drops to `@opndrive/s3-api`, with queue
  notices rendered in the UI. The legacy drop path was removed.
- Discord community links across the app and docs: landing navbars, the closing
  CTA, the dashboard sidebar, and the docs navbar and footer.
- GitHub Actions CI running lint, format check, typecheck, tests and builds,
  plus CodeQL scanning, Dependabot, CODEOWNERS, a security policy and issue
  templates.
- End-to-end test suite for the upload pipeline, coverage for the frontend state
  layer and drag-and-drop folder extraction, and a coverage ratchet that fails
  CI if `s3-api` drops below its current 97%.
- Vercel Web Analytics on the docs site.

### Changed

- Documentation rewritten from scratch: new information architecture (Getting
  Started / Guides / Development / Contributing / Maintainers / Reference),
  fabricated technical claims removed, all internal links verified. See
  [docs/content](./docs/content/index.mdx).
- `s3-api` migrated to the pnpm workspace.
- TypeScript and ESLint pinned back after Dependabot majors broke the build.

### Fixed

- Downloads report real progress, cancel correctly, and keep their filenames.
- Upload memory growth, network-error handling and render performance.
- Upload managers are disposed on session change instead of continuing against a
  bucket the user has left.
- A failed listing surfaces an error rather than appearing as an empty folder.
- Folder rename rolls back when it fails partway through.
- Batch delete reports errors instead of failing silently.
- Search cache is cleared on logout and session start.
- Conditional React hooks removed from `useSearch`, with a lint guard added.
- Deep breadcrumb paths stay on one line.

### Security

- Patched React Server Components CVEs.

[2.2.0]: https://github.com/Opndrive/opndrive/compare/v2.1.0...v2.2.0
