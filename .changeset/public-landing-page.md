---
'frontend': patch
---

Server-render the landing page, and stop createSession navigating

`isLoading` starts true, so `AuthProvider` renders a `Loading...` placeholder
for any route not on its public list, which is the whole body of the page a
crawler sees. `/privacy`, `/terms` and `/connect` were exempt for that reason.
The landing page was not, so the hero, the features and the FAQ were all
invisible without JavaScript. It is on the list now.

That also means the page renders before a session has been looked for, so the
main call to action no longer has a loading state: it reads "Get Started" and
goes to /connect until a session turns up, rather than server-rendering a
disabled button labelled "Loading..." as the page's primary CTA.

`createSession` no longer pushes to /dashboard. Its only caller is
ConnectWizard, which lives at /connect/[provider] and navigates itself once the
session resolves, so the branch could only have fired from `/` or `/login`,
neither of which has a connect form, and `/login` is not a route.

The way back into the drive, which those same public pages now have to show
rather than redirect, is labelled "Dashboard" instead of "Go to Dashboard". Two
words that the arrow beside them already carried, and enough width to push the
landing page's sticky nav wider than the pill it sits in. It is a rounded-full
pill to match that nav, and the arrow is thickened so it still reads as a
direction next to the label rather than dissolving into it.
