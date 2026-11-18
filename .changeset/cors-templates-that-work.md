---
'frontend': patch
---

Give every provider a CORS policy that actually lets the app connect

The Amazon S3 and Cloudflare R2 policies on the connect pages had no
AllowedHeaders, so the browser's preflight for the very first listing was
refused and the app could not connect at all. The Backblaze policy had a
trailing comma that made it invalid JSON, and had no rule for POST, which
multipart uploads and multi-file deletes need.

Every policy is now in the exact format its provider takes, allows the methods
and headers the app sends, exposes ETag for multipart uploads, and is filled in
with the address the page is open at instead of a placeholder. The setup guide
is open by default and marked required, except on MinIO and Wasabi, whose
defaults already allow every origin. Backblaze rules go in through its S3 API,
where POST is allowed, with a note for buckets that still have rules from the
old b2 tool steps, and the MinIO steps describe how MinIO Community Edition
really handles CORS: one server-wide origin list, every origin by default. Copy
buttons now say aloud when something has been copied.
