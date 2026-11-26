---
'frontend': minor
'docs': patch
---

Analytics only on the public pages, off by default, and nothing in self-hosted
copies

- **The app sends no analytics.** Vercel Web Analytics and Speed Insights ran on
  every page, the dashboard and the connect pages included. Both are gone, from
  the app and from the docs site.
- **Self-hosted copies send nothing.** Analytics is only built in when the build
  is given `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`. Without
  them, which is every default build and the Docker image, the build contains no
  analytics code, key or host, and makes no analytics request. The old
  components still asked a self-hosted server for a script that was not there on
  every page load; that request is gone too. CI now checks the built output, and
  the Docker image, for any trace of analytics.
- **What the public pages send, when analytics is configured.** The home page,
  the blog and the docs count page views and clicks on three kinds of link (into
  the app, to the GitHub repository, to the install guide). There are no
  cookies, nothing is stored in the browser, and the visit ID lives only in the
  page's memory. Addresses are sent without query strings. Do Not Track and
  Global Privacy Control turn it off completely, as does the existing opt-out.
  There is no analytics library: the few fields sent are built by our own code,
  and the privacy policy lists them from the same source.
- **A tighter security policy on public pages.** The home page, the blog and the
  legal pages may now connect only to this site (and the analytics host, when
  configured), instead of to any https address. Links from them into the app
  load a new page, so the app keeps the policy it needs to reach your storage.
- **The GitHub star count is fetched by the server**, once an hour, so readers'
  browsers no longer contact GitHub, and the app pages never show or fetch it.
- **Honest wording.** The privacy policy, the privacy settings, the opt-out
  switch and the docs now say exactly this, and no longer claim there is no
  Opndrive server at all.
