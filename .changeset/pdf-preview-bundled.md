---
'frontend': patch
---

Fix PDF preview, and draw it with a patched pdf.js from the app itself

PDF preview never worked in production. It put a static `/pdf-viewer.html` in an
iframe, and that page loaded pdf.js from a CDN. Our CSP only runs scripts that
carry the request's nonce, a static file cannot carry one, so the browser
blocked every script on the page and each PDF sat on "Loading PDF..." for good.

The pdf.js it tried to load was 3.11.174, which has a known flaw that lets a
crafted PDF run script. With the CSP relaxed, for example in report-only mode,
that page would have drawn any PDF named in its query string on the same origin
that keeps your S3 secret.

The preview now uses pdfjs-dist 6.5 from the app's own bundle, fetched only when
a PDF is opened, with the same page and zoom controls as before. The static page
and an unused copy of the pdf.js worker are gone, and a test now fails if any
page in `public/` tries to run script.

Also removed: packages nothing imports, including `react-pdf` and
`@monaco-editor/react`, which carried advisories of their own.
