# Contributing to Opndrive

Thanks for your interest in contributing. This file covers the essentials; the
full guide (branching, commit conventions, testing, troubleshooting) lives in
[docs/content/contributing/first-contribution.md](./docs/content/contributing/first-contribution.md)
so there's one place to keep it accurate.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Report
unacceptable behavior to contact@opndrive.app.

## Quick Start

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/your-username/opndrive.git
cd opndrive
git remote add upstream https://github.com/Opndrive/opndrive.git

# Install dependencies
pnpm install

# Start developing
pnpm dev:frontend
```

Open http://localhost:3000 - you should see Opndrive running.

## Before You Open a Pull Request

```bash
# From the repository root
pnpm check       # lint + format check
pnpm typecheck   # type-check both packages
```

Then, from whichever package you changed:

```bash
pnpm test
```

## Privacy: What Needs a Second Look

Opndrive keeps the user's own S3 credentials in their browser and publishes a
privacy policy that lists every single thing it stores. Two kinds of change can
quietly make that policy untrue.

### Adding a browser storage key

Register it in `frontend/src/lib/privacy/storage-keys.ts`. The privacy policy
renders its table straight from that file, and a test walks the source for
storage writes and fails on any key that is not registered. So the build tells
you; you do not have to remember.

Write the `purpose` for the person reading the privacy policy, not for us.

### Adding a third-party script

We currently ship no consent banner, and that is a deliberate position rather
than an oversight: everything we store is strictly necessary, and our analytics
is cookieless and stores nothing on the device, so neither ePrivacy Article 5(3)
nor the GDPR requires one.

Any of the following breaks that reasoning and **needs a consent banner before
it can ship**. Please open an issue first rather than adding one in a PR.

| Change                                         | Why it changes things                               |
| ---------------------------------------------- | --------------------------------------------------- |
| Google Analytics, PostHog, Amplitude, Mixpanel | All persist an identifier on the device to profile  |
| Sentry with session replay or persistent IDs   | Replay captures user content; the ID is storage     |
| Any advertising or conversion pixel            | Non-essential by definition, and a new controller   |
| Embedded YouTube, Vimeo or Twitter             | Third-party cookies are set on load, before a click |
| Intercom, Crisp or any chat widget             | Persistent visitor identity                         |
| Any cross-domain identity or attribution       | Squarely non-essential                              |
| User accounts on our own infrastructure        | Changes the controller relationship entirely        |

Also worth knowing: search terms and S3 object keys travel in the URL **hash**,
never the query string, because a hash is never sent to a server. If you are
adding a route that carries user data, keep it in the hash and check
`frontend/src/lib/privacy/private-params.ts`.

## Where to Go Next

- **New to the project?** Start with the
  [Introduction](./docs/content/getting-started/introduction.md).
- **Ready to write code?** Read the
  [full Contributing Guide](./docs/content/contributing/first-contribution.md)
  for branch naming, commit conventions, and the PR process.
- **Found a bug or have an idea?**
  [Open an issue](https://github.com/Opndrive/opndrive/issues).

## License

By contributing, you agree that your contributions are licensed under the same
AGPL-3.0 license as the rest of the project.

---

Thank you for contributing to Opndrive.
