# Branch Protection

Branch protection rules live in GitHub's repository settings (**Settings →
Branches**), not in this repo's code, so they can drift from what's written here
without a corresponding pull request. This page describes the intended
configuration, inferred from what the workflows and `CODEOWNERS` are built to
support - treat GitHub's settings screen as the final source of truth, and
update this page if you change it there.

## Required Status Check: `CI OK`

`main` should require the `ci-ok` job from `.github/workflows/ci.yml`, not the
individual `quality` / `frontend` / `s3-api` jobs. Those three are path-filtered
and get skipped when their part of the repo didn't change; GitHub treats a
skipped required check as unsatisfied forever, which would permanently block,
for example, a docs-only PR. `ci-ok` runs unconditionally and passes as long as
every job that _did_ run succeeded. See [CI/CD](../contributing/ci-cd.md) for
the full breakdown.

## Required Review: CODEOWNERS

`.github/CODEOWNERS` routes every path in the repo to a single owner
(`@yash-sangwan`). For that to actually gate merges, branch protection needs
"Require review from Code Owners" enabled - otherwise CODEOWNERS is
documentation only and doesn't block anything.

## Recommended Baseline

- Require the `ci-ok` status check to pass before merging.
- Require a Code Owner review before merging.
- Require branches to be up to date with `main` before merging, so CI runs
  against the code that will actually land.
- Do not allow force-pushes or deletions of `main`.

## Why This Matters for Contributors

If your PR is stuck "waiting for status to be reported" instead of showing a
clear pass/fail, check whether `ci-ok` ran at all - a workflow syntax error
upstream of it will leave it in a permanently pending state, which reads the
same as a hung check to someone unfamiliar with the path-filtering setup.
