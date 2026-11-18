---
'frontend': patch
---

Say what Opndrive is, drop claims it cannot back up, and explain connection
errors on every provider page

The home page heading now says what the product is - an open-source web UI for
S3, R2, MinIO and more - with the old slogan beneath it. The landing page no
longer promises versioning, backups, collaboration or "complete" security, and
the FAQ says plainly what is true: keys stay in your browser, using opndrive.app
means trusting the code it serves, and self-hosting gives full control.

Every /connect/<provider> page has an "If it fails" section quoting the exact
messages the app shows, with their fixes and a link to the docs. The MinIO page
says Opndrive is an object browser, not an admin console. DigitalOcean Spaces
has its own provider entry and page, with its CORS policy as the XML file
DigitalOcean documents for s3cmd.
