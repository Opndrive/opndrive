---
'frontend': patch
---

Stop sending private data to analytics, and correct the privacy copy

Search terms and S3 object keys moved from the query string into the URL hash,
which a browser never transmits, and analytics now redacts whatever is left. The
settings privacy panel no longer claims we collect nothing, and the four privacy
toggles that no code read are gone apart from the analytics opt out.
