---
'frontend': minor
'docs': patch
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
deletes still running are only cancelled if you say so. Adding a connection
while work is running asks the same question. The two switchers share one busy
state, so one cannot start while the other is still checking, and signing out
during a slow switch keeps you signed out.

"Add connection" takes you to the connect page. Saving there adds the connection
to the list and opens the dashboard on it. The connect form has a new, optional
"Connection name"; left blank, the connection is named after its provider and
bucket, and the form shows that name before you submit. Every add is its own
entry: the same keys on another bucket, or even exactly the same connection
again, are listed separately rather than merged.

Each connection has a delete button, with a confirmation, that removes it and
its keys from this browser. Your bucket and the files in it are not touched. The
connection you are using has no delete button. "Clear Session" signs the browser
out: it forgets every saved connection and its keys, and asks first when more
than one is saved, so nothing is left behind on a shared machine.

An interrupted folder delete is now remembered per account as well as per
bucket, so it is never offered in a bucket of the same name in another account.
Records written before this change are not offered at all.

The list is kept in a new `s3_connections` entry in local storage, with the
connection in use, which the privacy policy now lists; tabs open at the same
time see each other's changes rather than overwriting them. `s3_user_session` is
unchanged and remains the connection in use. A session you already had is added
to the list the first time the app loads.

On a phone the two switchers take the logo's place in the top bar, and on every
width the names truncate instead of pushing the search and the profile menu off
the screen. The profile menu can now be opened from the keyboard.
