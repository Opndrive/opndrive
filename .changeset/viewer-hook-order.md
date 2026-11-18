---
'frontend': patch
---

Fix the preview viewers' crashes on sign-in, Retry that did nothing, and more

The image, video, audio, code and spreadsheet viewers, and the details panel's
file information, each waited for the session before setting themselves up. That
changed how React saw them the moment sign-in finished, which can crash a
preview that was already open. They now set up the same way every time.

Along the way:

- **Try again** after a failed preview did nothing. It cleared the error and
  showed "Loading" for good, because nothing asked for the file again. It does
  now.
- Every image preview downloaded the image twice, once for a leftover check that
  used the result for nothing.
- Zooming an image with the mouse wheel never worked, because the zoom was wired
  up before the image had appeared.
- Clicking quickly from one file to another could show the first file's details
  for the second.
