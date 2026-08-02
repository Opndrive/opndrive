# CI/CD Pipeline

What actually runs when you push or open a PR, read straight from
`.github/workflows/ci.yml` and `.github/workflows/codeql.yml`.

## CI (`ci.yml`)

Triggers on every pull request and on pushes to `main`.

```mermaid
flowchart TD
    A[Push or PR] --> B{changes: paths-filter}
    B -->|frontend/**, s3-api/**, or root config changed| C[frontend job]
    B -->|s3-api/** changed| D[s3-api job]
    B -->|frontend/**, s3-api/**, or root config changed| E[quality job]
    B -->|no relevant change| F[job skipped]
    C --> G[ci-ok]
    D --> G
    E --> G
    F --> G
    G -->|any job that ran failed| H[Required check: fails]
    G -->|everything that ran succeeded| I[Required check: passes]
```

1. **`changes`** - detects which of `frontend/**`, `s3-api/**`, or root config
   files (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
   `eslint.config.mjs`, `prettier.config.js`, `.prettierignore`, `.nvmrc`, the
   workflow file itself) changed.
2. **`quality`** - runs if anything relevant changed. Checks Prettier formatting
   across the whole repo and runs ESLint on `frontend/` and `s3-api/`. Lint here
   does **not** use `--max-warnings=0` - the repo currently carries ~98
   pre-existing warnings that are tracked separately, not newly introduced.
   Zero-warning enforcement on touched files happens in the pre-commit hook
   instead (see [Coding Standards](./coding-standards.md)).
3. **`frontend`** - runs if `frontend/**`, `s3-api/**`, or root config changed.
   It deliberately also runs on `s3-api` changes: the frontend consumes
   `@opndrive/s3-api` through the workspace, so a change there can break the
   frontend build. Typechecks, tests, and builds the Next.js app.
4. **`s3-api`** - runs only if `s3-api/**` changed. Typechecks, runs
   `test:coverage` (which enforces the thresholds in `vitest.config.ts` - see
   [Testing](../development/testing.md)), publishes the coverage table to the
   run summary, and builds the package.
5. **`ci-ok`** - always runs, and is the single required status check for branch
   protection. It passes if every job that actually ran succeeded, and treats a
   _skipped_ job (because its path filter didn't match) as fine.

That last point matters if you're wondering why branch protection points at
`ci-ok` instead of `frontend`/`s3-api`/`quality` directly: GitHub treats a
skipped job as "never satisfied" for branch protection, so requiring the
individual jobs would permanently block docs-only PRs that never trigger the
`frontend` or `s3-api` jobs. `ci-ok` exists specifically to make path-filtered
CI compatible with required checks.

## CodeQL (`codeql.yml`)

Runs on every PR and push to `main`, plus a weekly scheduled scan (Mondays,
03:17 UTC). Analyzes JavaScript/TypeScript for security issues. It's
informational, not a required check, so it won't block a merge, but findings
show up in the repository's Security tab.

## Running the Same Checks Locally

All of these run from the repository root:

```bash
pnpm format:check                    # what the quality job's format check runs
pnpm lint                            # what the quality job's lint step runs
pnpm typecheck                                  # both packages, what the typecheck steps run
pnpm test && pnpm build:frontend                # what the frontend job runs
pnpm --filter @opndrive/s3-api test:coverage    # the s3-api job's coverage gate
pnpm --filter @opndrive/s3-api build            # what the s3-api job builds
```

CI reads the Node version from `.nvmrc` (currently `22`) rather than pinning it
in the workflow, so `nvm use` locally gets you the same version CI runs.
