---
'frontend': patch
---

Declare the rename provider's hooks unconditionally

`RenameProvider` returned early — once while authenticating, once when signed
out — above every hook it declares. That makes the number of hooks depend on
session state, which is the one thing rules-of-hooks exists to prevent: signing
out flips `isAuthenticated` on an already-mounted provider, so the next render
runs one hook where the previous ran twenty. React raises "Rendered fewer hooks
than expected" and the dashboard goes down with it.

The hooks now come first and the two returns last. `renameService` is memoised
on `apiS3` rather than rebuilt on every render, which also settles a stale
closure: as a bare call it was absent from every dependency array, so the rename
callbacks captured whichever instance the first render happened to build and
would have kept talking to the previous bucket after a switch.

Eighteen lint warnings had been reporting this, and `--max-warnings=0` in
lint-staged meant the file could not be committed at all.
