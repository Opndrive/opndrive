---
'frontend': patch
---

Never take a name for free from a listing cut short without a token

Dropping more than five loose files checks their names against one listing of
the destination. A listing page that said there was more to come, but gave no
continuation token, was read as the end of the listing, so every name past that
page looked free and its file was uploaded over the one already there. S3 always
sends the token; other S3-compatible services may not.

That page now ends the listing early, and names it did not find are checked one
by one. A page that says it is the last is still taken as the last.
