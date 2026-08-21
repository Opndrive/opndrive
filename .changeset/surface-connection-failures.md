---
'frontend': patch
---

Show what went wrong when a bucket cannot be reached, instead of a skeleton that
never resolves.

A failed listing set an error status that no page read, so both dashboard pages
rendered the loading skeleton forever. The store now keeps the reason and hands
the page one value it cannot read without deciding what a failure looks like, so
the next view added cannot repeat the omission.

Credentials are also proved before a session is built on them: constructing the
client touched no network, so wrong keys only failed later on the dashboard, a
page away from the form that could fix them. They now fail on /connect, naming
whether the problem is the keys, the bucket, the region or a missing CORS rule.
