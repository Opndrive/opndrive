---
'frontend': patch
---

Sign a fresh thumbnail link when the cached one has expired

Grid thumbnails reuse one signed link per image, and load the image only once
the tile is scrolled into view. A link handed out near the end of its hour could
be dead by then: the tile showed its file icon instead, and every tile after it
was handed the same dead link.

When a thumbnail will not load, the tile now drops that link from the cache,
signs a fresh one and tries once more, showing the icon in the meantime. An
image that fails on the fresh link too keeps the icon.
