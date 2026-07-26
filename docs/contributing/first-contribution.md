# Your First Contribution

A straight path from "I want to help" to an open pull request. For the deeper
reference material this page links out to, see
[Coding Standards](./coding-standards.md),
[Branching & PRs](./branching-and-prs.md), and [CI/CD](./ci-cd.md).

## 1. Fork and Clone

```bash
git clone https://github.com/your-username/opndrive.git
cd opndrive
git remote add upstream https://github.com/Opndrive/opndrive.git
```

## 2. Set Up Your Environment

Follow [Development Setup](../development/setup.md) to get the app running
locally.

## 3. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

See [Branching & PRs](./branching-and-prs.md#branch-naming) for the naming
convention.

## 4. Make Your Change

- Follow the [Coding Standards](./coding-standards.md).
- Follow the [Component Guidelines](../development/component-guidelines.md) if
  you're touching UI.
- Update documentation alongside code when behavior changes.

## 5. Test Your Change

From the repository root:

```bash
pnpm typecheck   # both packages
pnpm lint        # both packages
pnpm check       # lint + format check, what CI runs
```

From the package you changed:

```bash
pnpm test
```

There's no enforced coverage percentage (see
[Testing](../development/testing.md) for the current state), but if you touched
a hook, a state transition, or anything async, a Vitest test is the difference
between "works on my machine" and "works."

## 6. Commit

```bash
git add .
git commit -m "feat: add file upload progress indicator"
git push origin feature/your-feature-name
```

See [Coding Standards](./coding-standards.md#commit-messages) for the commit
message convention. The pre-commit hook (Husky + lint-staged) will lint and
format your staged files automatically.

## 7. Open a Pull Request

Open a PR against `Opndrive/opndrive`'s `main` branch. The PR template will ask
what the change does, which issue it relates to, and how to test it. See
[Branching & PRs](./branching-and-prs.md) for what happens after you open it
(required reviewers, CI checks, merge).

## Reporting Bugs or Requesting Features

Use the issue templates: **Bug report** asks for reproduction steps and
environment details; **Feature request** asks for the problem you're solving and
alternatives you considered. Both are pre-filled when you click "New Issue" on
GitHub.

## Getting Help

1. Check the docs in `/docs`.
2. Search existing issues before opening a new one.
3. Open a GitHub Discussion, or an issue with the "question" label.

---

Thank you for contributing to Opndrive. Every fix, however small, is
appreciated.
