---
'frontend': patch
---

Stop delete operations outliving the session. The upload store now owns each
delete's AbortController, so ending a session aborts everything in flight
instead of leaving a loop deleting objects under credentials the user has
already signed out of. Cancelling from the operations modal now aborts the
delete as well, rather than only removing its card.
