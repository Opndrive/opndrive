# Dependency Policy

Dependabot is configured in `.github/dependabot.yml` with three npm scopes
(root, `frontend/`, `s3-api/`) plus GitHub Actions itself, each checked weekly
and each grouped into a single PR per ecosystem rather than one PR per package.

## Major Versions Are Never Auto-Proposed

Every ecosystem excludes `version-update:semver-major`. This is a deliberate,
documented decision, not an oversight - the config comment in `dependabot.yml`
explains why:

> Major-version bumps are not proposed automatically. They tend to be breaking
> (see the eslint 9->10 / typescript 5->7 incident), and this repo has no
> workspace, so a break in one package isn't always caught by the checks that
> run against a different package. Majors are a deliberate, manual upgrade, done
> one at a time with verification.

That incident is real and recent: a Dependabot major-version bump broke the
build, and it was fixed by pinning TypeScript and ESLint back
(`fix: pin typescript/eslint back after breaking Dependabot majors`). Because
this repo has no pnpm workspace, `frontend/` and `s3-api/` are typechecked and
built independently in CI - a major bump landing in one package's lockfile
doesn't automatically get exercised by the other package's checks, so a breaking
major can slip through more easily than it would in a workspace setup.

## What This Means in Practice

- **Minor and patch updates** arrive automatically as grouped weekly PRs. Review
  the CI result and merge; there's rarely anything to investigate.
- **Major version upgrades** are a manual task: pick one dependency, upgrade it
  alone, run the full check suite (`pnpm check`, `pnpm typecheck`, `pnpm test`,
  `pnpm build`) in both `frontend/` and `s3-api/`, and only then move to the
  next one. Don't batch multiple majors in one PR - if something breaks, you
  want to know which upgrade caused it.
- Commit messages for dependency PRs are prefixed `chore(deps)` (npm) or
  `chore(ci)` (GitHub Actions), matching the `commit-message.prefix` set per
  ecosystem in `dependabot.yml`.

## Changing the Policy

If a major-version freeze ever needs lifting for a specific package (for
example, once a workspace is introduced and cross-package breakage becomes
easier to catch in CI), update the `ignore` block for that `package-ecosystem`
entry in `dependabot.yml` and note why in the commit message, the same way the
original decision is documented there.
