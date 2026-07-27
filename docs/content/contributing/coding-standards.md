# Coding Standards

## Code Style

- **TypeScript**: strict type checking, no `any` where a real type is possible.
- **ESLint + Prettier**: enforced by `pnpm lint` / `pnpm format` and auto-fixed
  on staged files by the pre-commit hook.
- **Naming**: kebab-case for files, PascalCase for components, camelCase for
  everything else.

```typescript
// Good
interface FileUploadProps {
  file: File;
  onProgress: (percentage: number) => void;
  onComplete: (result: UploadResult) => void;
}

// Avoid
interface Props {
  data: any;
  callback: Function;
}
```

## Component Development

Follow the [Component Guidelines](../development/component-guidelines.md):
feature-based organization, accessible by default, typed props, consistent with
the existing Tailwind + CVA styling pattern.

## Commit Messages

[Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description
```

| Type       | Use for                                   |
| ---------- | ----------------------------------------- |
| `feat`     | New feature                               |
| `fix`      | Bug fix                                   |
| `docs`     | Documentation                             |
| `style`    | Formatting, no logic change               |
| `refactor` | Code change that isn't a fix or a feature |
| `test`     | Adding or updating tests                  |
| `chore`    | Maintenance, dependency updates           |

```bash
git commit -m "feat(dashboard): add file upload progress indicator"
git commit -m "fix(auth): resolve login redirect issue"
git commit -m "docs: update installation instructions"
```

Common scopes: `dashboard`, `auth`, `upload`, `ui`, `s3-api`, `docs`, `config`.

## Pre-commit Hook

`.husky/pre-commit` runs `lint-staged` on every commit:

- `eslint --fix --max-warnings=0` and Prettier on staged JS/TS files
- Prettier on staged JSON/Markdown/YAML/CSS/HTML files

This is the only Git hook in the repo - there's no `commit-msg` or `pre-push`
hook, so this won't catch a broken test or a type error. Run `pnpm check` and
`pnpm typecheck` yourself before opening a PR.

## A Note on Hook Debt

`eslint.config.mjs` currently carries a deliberate, tracked exception: 15 files
with a pre-existing `react-hooks/rules-of-hooks` violation are downgraded from
`error` to `warn` so `next build` stays green while they get fixed one at a
time. It's a ratchet, not a free pass: `lint-staged` runs with
`--max-warnings=0`, so touching any file on that list still forces a fix, and no
new file can be added to it. If you're touching one of those files anyway,
fixing the violation is welcome (and small enough to be a good first PR on its
own).
