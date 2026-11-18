---
'docs': patch
---

Add CORS and connection-error guides, real screenshots and breadcrumbs to the
docs

A new Configure CORS guide gives every provider the same policy the app's setup
guide shows, and a test keeps the two identical. A new Fixing Connection Errors
page explains each message Opndrive shows and the browser console line that
comes with it; the developer troubleshooting page is now Development
Troubleshooting.

Every page has its own description and a breadcrumb trail for search engines,
and the home page names the site "Opndrive Docs". The navbar's logo and Discord
links have names screen readers can read, the home subtitle is readable in dark
mode, and the five screenshot placeholders are real screenshots taken against a
local demo bucket. Mermaid diagrams load only when one scrolls near, so pages
with a diagram ship half as much JavaScript up front; a diagram already scrolled
past draws at once, and a printout shows a diagram's source rather than a gap.
Fixing Connection Errors covers all five messages and every error code the app
files under them, and a test keeps it in step with the app, as another does for
the CORS guide; CI now runs them for docs-only changes too.
