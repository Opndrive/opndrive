# Downloading Files

## Single Files

Click a file's download action and Opndrive requests a short-lived presigned S3
URL (`getSignedUrl`, 15 minute expiry), then triggers a native browser download
against it.

## Current Limitations

Worth knowing before you rely on either of these:

- **Progress and cancel are not wired up yet.** The download UI shows a progress
  bar and a cancel option, but the underlying implementation
  (`frontend/src/features/dashboard/services/download-service.ts`) reports a
  simulated progress value rather than real bytes transferred, and the cancel
  control does not stop an in-flight browser download. The download itself still
  completes correctly - only the progress/cancel _indicators_ are not connected
  to it.
- **Folder download isn't implemented.** Downloading a folder currently throws
  "Folder download not yet implemented" rather than zipping its contents.

Both are open, well-scoped issues if you're looking to contribute - real
progress would mean streaming the response and reading `ContentLength` against
bytes read (the pattern `BYOS3ApiProvider.downloadFile` in `s3-api` already uses
internally), and folder download needs a zip step client-side or via a batch of
presigned URLs.

## Why Presigned URLs

Downloads go straight from S3 to your browser using a presigned URL, the same
pattern used for uploads (see [Uploading Files](./uploading-files.md)) - no
Opndrive-operated server ever sees the file's contents.
