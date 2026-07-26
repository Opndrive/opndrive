# Release Process

Opndrive ships two different things on two different cadences: the
`@opndrive/s3-api` npm package, and the frontend app itself. Neither has an
automated release workflow today - both are manual, and this page documents what
that manual process actually involves.

## Publishing `@opndrive/s3-api`

`s3-api/package.json` is set up as a real publishable package (`main`, `types`,
`exports`, and `files: ["dist"]` all point at the built output), but there is no
CI step that runs `npm publish` - check `.github/workflows/` and you'll only
find `ci.yml` and `codeql.yml`, neither of which publishes anything. A release
today means, from `s3-api/`:

```bash
# 1. Bump the version
#    (edit "version" in s3-api/package.json, following semver)

# 2. Verify it
pnpm check      # typecheck + test
pnpm build      # tsc, writes to dist/

# 3. Publish
npm publish --access public
```

`s3-api/CHANGELOG.MD` should be updated alongside the version bump so consumers
can see what changed.

## Bumping the Frontend's Dependency

Publishing a new `s3-api` version does **not** automatically update the
frontend. `frontend/package.json` pins an explicit version range (for example
`"@opndrive/s3-api": "^2.4.0"`), so after a publish:

```bash
cd frontend
pnpm add @opndrive/s3-api@latest
pnpm typecheck && pnpm build
```

It's normal for the frontend's pinned version to lag behind the latest published
`s3-api` for a while - just be aware it's a separate, manual step, not something
that happens as a side effect of publishing.

## Frontend Releases

The frontend (`frontend/package.json`, currently `2.0.0`) doesn't publish
anywhere - it's deployed directly (Vercel/Netlify) or built into a Docker image
(see [Deployment](../getting-started/deployment.md)). There's no root
`CHANGELOG.md` today; if you're cutting a notable release, consider adding one
rather than relying on commit history alone.

## A Note on Version Numbers

The root `package.json` (`1.0.0`), `frontend/package.json` (`2.0.0`), and
`s3-api/package.json` (independently versioned, published to npm) are three
separate version numbers that don't move together. That's expected in a
non-workspace monorepo like this one, but it's worth knowing so a "v2.0.0"
mentioned in one context isn't assumed to mean the same thing in another.

## Open Improvement

There's no scripted or CI-driven release for `s3-api` yet. If publish frequency
increases, a `release.yml` workflow (triggered on a version tag, running build +
`npm publish`) would remove the manual steps above and the risk of forgetting
one.
