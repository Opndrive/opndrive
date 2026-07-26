# Branching & Pull Requests

## Branch Naming

| Prefix                 | Use for                              |
| ---------------------- | ------------------------------------ |
| `feature/description`  | New functionality                    |
| `fix/description`      | Bug fixes                            |
| `docs/description`     | Documentation only                   |
| `refactor/description` | Code changes with no behavior change |

```bash
git checkout -b feature/add-file-sharing
```

## Opening a Pull Request

Target `main` on `Opndrive/opndrive`. GitHub pre-fills the
[PR template](https://github.com/Opndrive/opndrive/blob/main/.github/pull_request_template.md),
which asks for:

- What the PR does and which issue it relates to
- Type of change (bug fix, feature, refactor, docs, other)
- How to test it, step by step
- Screenshots for UI changes
- A short checklist (self-review done, docs updated if needed)

Keep PRs focused: one feature or fix per PR makes review faster and makes
`git bisect` useful later if something needs to be tracked down.

## Who Reviews It

`.github/CODEOWNERS` currently routes every path to a single owner
(`@yash-sangwan`). In practice this means every PR needs that owner's approval
before merging, regardless of which part of the repo it touches.

## What Has to Pass

Branch protection on `main` requires the `CI OK` check from
`.github/workflows/ci.yml` (see [CI/CD](./ci-cd.md) for how that check is
built). CodeQL also scans every PR for security issues, but it's informational,
not a required check.

## Reporting Bugs and Requesting Features

Use the GitHub issue templates rather than a blank issue:

- **[Bug report](https://github.com/Opndrive/opndrive/blob/main/.github/ISSUE_TEMPLATE/bug_report.md)**
  asks for reproduction steps, expected vs. actual behavior, and environment
  details.
- **[Feature request](https://github.com/Opndrive/opndrive/blob/main/.github/ISSUE_TEMPLATE/feature_request.md)**
  asks for the problem you're solving, your proposed solution, and alternatives
  you considered.

## Issue Labels

| Type                                                                     | Priority                    | Status                                     |
| ------------------------------------------------------------------------ | --------------------------- | ------------------------------------------ |
| `bug`, `enhancement`, `documentation`, `good first issue`, `help wanted` | `priority: high/medium/low` | `status: needs review/in progress/blocked` |

## Review Process

1. CI runs automatically (lint, typecheck, test, build - path-filtered, see
   [CI/CD](./ci-cd.md)).
2. The code owner reviews and requests changes or approves.
3. Once CI is green and the review is approved, the PR is merged.
