---
'frontend': patch
---

Stop the empty state artwork from eating a drag

The "no files or folders" illustration was an `<img>`, so the browser treated it
as draggable content of its own. Dropping files onto the middle of the empty
page, which is where the artwork sits, started an image drag instead of an
upload, and dragging the picture around the page was possible for no reason.

It is a background image now, which the browser will not pick up, and the whole
empty state block ignores pointer events so the dropzone underneath receives the
drag wherever you aim it.
