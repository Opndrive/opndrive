---
'@opndrive/s3-api': patch
'frontend': patch
---

Stop a large upload at its first part when the bucket hides the ETag header, and
save downloads so they can never open as a page

- **Uploads in parts.** S3 sends each part's ETag as a response header, and a
  browser hides every header the bucket's CORS rules do not expose. The uploader
  used to carry on without it, send every part of the file, and only then have
  S3 refuse to put them together. It now stops after the first part and says
  why: add `ETag` to `ExposeHeaders` in the bucket's CORS configuration. The
  error is not retried, since it would fail the same way until that changes.
- **Downloads.** A downloaded file was handed to the browser with its own type,
  such as `text/html` or `image/svg+xml`, at an address on this site. It was
  only ever saved, but it is now typed as plain bytes, so it could not be shown
  as a page here even if it were opened.
