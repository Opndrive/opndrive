# Troubleshooting

For setup-specific issues (won't install, won't start, can't connect a bucket),
see the troubleshooting sections in
[Installation](../getting-started/installation.md) and
[First Upload](../getting-started/first-upload.md) first. This page covers
everything else.

## Development

**TypeScript errors that don't match what's in the file** Restart the TS server:
`Cmd/Ctrl + Shift + P` → "TypeScript: Restart TS Server" in VS Code. Next.js's
incremental type info can get stale.

**Styling changes not showing up** Restart `pnpm dev`. If that doesn't help,
delete `.next/` and restart:

```bash
rm -rf .next
pnpm dev
```

**Module resolution errors after pulling new changes**

```bash
rm -rf node_modules
pnpm install
```

Do this in whichever package (`frontend/` or `s3-api/`) is affected - they have
independent `node_modules`.

## Linting and Formatting

**Pre-commit hook fails** `lint-staged` runs `eslint --fix` and Prettier on
staged files automatically, but ESLint errors (not warnings) will still block
the commit. Run:

```bash
pnpm lint
pnpm format
```

then re-stage and commit again.

**A file you didn't expect shows lint warnings on every change** Check if it's
on the tracked debt list in `eslint.config.mjs` (see
[Coding Standards](../contributing/coding-standards.md#a-note-on-hook-debt)).
Warnings there are expected until the underlying issue is fixed; they won't
block your commit unless you introduce a new one.

## CI

**A PR's required check is stuck pending instead of pass/fail** Check whether
`ci-ok` in the Actions tab actually ran. If an earlier job failed to even start
(a workflow syntax issue, usually), `ci-ok` never runs and the check sits
pending indefinitely rather than failing outright. See
[CI/CD](../contributing/ci-cd.md).

**CI fails but the same commands pass locally** Run the exact commands from
[CI/CD](../contributing/ci-cd.md#running-the-same-checks-locally) rather than
`pnpm dev`-adjacent commands - a stale local `.next/` cache or `node_modules`
state is the usual cause of "works on my machine."

## Still Stuck?

[Open an issue](https://github.com/Opndrive/opndrive/issues) with your OS,
Node/pnpm versions, the exact command, and the full error output.
