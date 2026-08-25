---
'frontend': patch
---

Hold a drive request's status and its failure reason as one value

The store kept `status`, `recentStatus`, `failures` and `recentFailures` as four
maps keyed by the same prefix, with nothing forcing any two of them to agree.
That had already caused a bug: with one shared failures map, the directory
listing finishing erased why the recent list had failed, and the recent list
fell back to a generic "something went wrong". Splitting the map per request
kind fixed that instance without fixing the shape.

Each key now holds one `RequestState`, so a reason is only ever written with the
status it explains, and the error path is a single write rather than two. No
behaviour change: the `AsyncState` selectors already hid the store's shape from
every page, so nothing outside `data-context` and its tests moved.
