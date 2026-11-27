---
'frontend': patch
---

Instant search result chunks, one place for S3 keys, and two small cleanups

- **Search results appear at once.** The search page reveals long result lists a
  hundred at a time. Each chunk used to wait 300 ms behind a timer for results
  already in memory, and the timer was started inside a state updater, which
  React may run twice. A chunk now appears as soon as you scroll near the end or
  press the button, and a list that still fits on screen keeps filling. The
  "Loading more items..." spinner, which only ever showed that timer, is gone.
  (#79)
- **Searching re-renders less.** The search hook subscribed to the whole search
  store, so every page a streaming search wrote re-rendered every component
  using it, even for another search. It now subscribes only to what it reads.
  (#106)
- **One place turns a path into an S3 key.** The rename service and the unique
  name check each had their own copy of `generateS3Key`'s path handling. Both
  now use it, which also fixes renaming a folder inside a path given without its
  trailing slash: `docs` and `photos` made `docsphotos/`. (#67)
- **Cache keys are tested.** The drive store's cache keys come from one helper,
  now covered by tests. (#71)
- **No placeholder handlers.** The browse page passed three empty click handlers
  down to the file list. (#72)
