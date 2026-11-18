---
'frontend': minor
---

Keep more than one storage connection and switch between them

Connecting a second account meant clearing the session and typing the keys
again. The top bar now has a connection switcher beside the bucket switcher: it
lists every connection you have added, each with its provider's logo and the
name you gave it, and long names are cut short with the whole of them in the
tooltip. Picking one opens the dashboard on it, on the bucket you were last
using there.

Switching goes through the same checks a bucket switch does. The connection is
proved before anything of the current one is touched, so keys that have since
been revoked leave you where you were with the reason on screen, and uploads or
deletes still running are only cancelled if you say so.

"Add connection" takes you to the connect page. Saving there adds the connection
to the list and opens the dashboard on it. The connect form has a new required
"Connection name", which is how the connection is listed when you switch between
them. Every add is its own entry: the same keys on another bucket, or even
exactly the same connection again, are listed separately rather than merged.

Each connection has a delete button, with a confirmation, that removes it and
its keys from this browser. Your bucket and the files in it are not touched. The
connection you are using has no delete button - "Clear Session" is how that one
ends, and it now forgets only that connection rather than every one you have
saved.

The list is kept in a new `s3_connections` entry in local storage, which the
privacy policy now lists. `s3_user_session` is unchanged and remains the
connection in use. A session you already had is added to the list the first time
the app loads.
