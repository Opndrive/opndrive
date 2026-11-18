---
'@opndrive/s3-api': patch
---

Stop a signed-URL upload that is cancelled while its URL is being signed

`SignedUrlUploader.upload()` signed the URL first and only then made the abort
controller that `cancel()` uses. A cancel that landed while the URL was being
signed found nothing to abort, so the file was uploaded the moment the URL came
back, although the upload had been cancelled.

The controller is now made before signing, and an upload cancelled by then sends
nothing. A cancelled uploader also refuses any later `upload()`.
