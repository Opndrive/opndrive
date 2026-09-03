---
'@opndrive/s3-api': patch
'frontend': patch
---

Work in more than one bucket on the same connection

The bucket was fixed when you connected and reaching another one meant clearing
the session and typing the keys again. The top bar now names the bucket you are
in and opens a list of the others: search, pick, done.

Switching proves the new bucket before it touches anything, so a bucket that
does not exist, sits in another region, or cannot be read by those keys leaves
you exactly where you were, with the reason on screen. When it does succeed, the
old bucket's listings, searches and operation history go with it rather than
lingering under the new bucket's name, and you land at the new bucket's root -
any prefix you had configured described the bucket you just left.

Uploads and deletes still running are never thrown away quietly. Switching says
how many there are and cancels them only if you say so.

The list is asked for when you open the switcher and not before, since listing
buckets is a billed request that browsing never needs. It also needs an
account-level permission that the connect guides do not ask for
(`s3:ListAllMyBuckets`), and some S3-compatible providers do not implement
bucket listing at all - so where the list is unavailable the switcher offers a
box to type a bucket name into, which needs nothing beyond the access you
already have.

`getBuckets` now asks for bucket regions as well as names. S3 reports a bucket's
region only when the request carries at least one parameter, so an unfiltered
listing came back without them and switching to a bucket in another region built
a client for the region you were already on. Providers that do not report
regions are unchanged: an unreported region stays unreported rather than being
guessed at.
