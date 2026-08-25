---
'frontend': patch
---

Let signed-in visitors read the public pages, and clear out five rough edges

The landing page, /connect and every provider page used to bounce a visitor with
a connected bucket straight to the dashboard. All three exist to be read - the
connect pages carry their own metadata and canonical URLs so they can be found
in search - which meant the page Google indexed was the one page a returning
user could never see, and anyone with one bucket connected could not reach the
form to add a second. They stay put now, and a "Go to Dashboard" control appears
for whoever has a session. The landing page's main button carries it rather than
growing a second button beside it: that button already sent returning visitors
to their drive, it just said "Get Started" while doing so.

Opening a row's overflow menu from the keyboard now selects the row, as the
mouse already did. Radix opens the menu from its own keydown handler and calls
preventDefault, so the click that selection hung off was never synthesised and
the toolbar showed nothing.

Folder navigation no longer puts a `key` parameter in the URL. It carried the
folder's own name beside a prefix that already ended in it, and nothing read it
for its value - duplicated data on every navigation, in an app whose privacy
story is about keeping paths out of query strings.

Cloudflare R2's endpoint field showed a literal `{{accountId}}`, our own
templating syntax, as the example to type. It reads the way Cloudflare's docs
write it now.

`--danger` held byte-identical values to `--destructive` in every theme, three
uses against fifty-four, and is gone. robots.txt repeated one rule three times
where `*` already covered every bot.
