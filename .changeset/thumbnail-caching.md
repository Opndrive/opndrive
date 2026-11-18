---
'@opndrive/s3-api': patch
'frontend': patch
---

Stop the grid view downloading every image again, and skip huge ones

A bucket holds only the originals, so each thumbnail in the grid view is the
whole image. Three things made that worse than it had to be:

- The size limit was checked against the size as displayed, 400 for "400 MB", so
  no image was ever too big for a thumbnail. The check now uses bytes, with a 10
  MB limit for thumbnails. Larger images show their icon, and still open in the
  preview.
- Each thumbnail signed a new link to its image every time it appeared. A new
  link is a new address to the browser, so scrolling or coming back to a folder
  downloaded every image again. The same image now gets the same link for as
  long as it lasts, and the response tells the browser it may keep the image for
  that long. `getSignedUrl` gains `responseCacheControl` for this.
- The component's hooks ran after an early return, so their number changed once
  sign-in finished.

Images also decode off the main thread now.
