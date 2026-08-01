# Development Setup

This guide gets Opndrive running locally for development. It reflects the actual
scripts and tools in this repository, not idealized ones, so every command here
should work as written.

## Prerequisites

- **Node.js** (v18 or later) - [Download here](https://nodejs.org/)
- **PNPM** (v8 or later) - Install with `npm install -g pnpm`
- **Git** - [Download here](https://git-scm.com/)
- **VS Code** (recommended) - [Download here](https://code.visualstudio.com/)

### Optional but Recommended

- **AWS CLI** - For S3 integration testing

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Opndrive/opndrive.git
cd opndrive
```

### 2. Install Dependencies

```bash
# Install root dependencies (lint/format tooling, Husky hooks)
pnpm install

# Install frontend dependencies
cd frontend
pnpm install

# Install S3 API dependencies
cd ../s3-api
pnpm install
```

### 3. Start the Development Server

```bash
cd frontend
pnpm dev
```

### 4. Open Your Browser

- **Frontend**: http://localhost:3000

**That's it.** Opndrive is configured through its UI, not environment files. The
first time you visit the app you'll see a "Get Started" button that takes you to
`/connect`, where you enter your AWS credentials through a form. See
[Environment Variables](../reference/environment-variables.md) for the small
number of env vars the app actually reads (none of them are AWS credentials).

## Project Structure Understanding

After setup, the directories you'll touch most:

```
opndrive/
├── frontend/src/
│   ├── app/                 # Next.js pages and layouts
│   ├── features/            # Feature-based modules (dashboard, upload, settings, ...)
│   ├── shared/               # Reusable components
│   ├── context/              # React Context providers (auth, data, theme, ...)
│   └── services/             # Code that talks to @opndrive/s3-api
└── s3-api/                  # Published npm package, S3 integration layer
```

See [Repository Structure](./repository-structure.md) for the full breakdown.

## Development Workflow

### 1. Branch Strategy

```bash
git checkout -b feature/your-feature-name
git add .
git commit -m "feat: add your feature description"
git push origin feature/your-feature-name
```

### 2. Code Quality Checks

Run these from the **repository root** before committing:

```bash
# Type-check both packages
pnpm typecheck

# Lint both packages
pnpm lint

# Format check
pnpm format:check

# Lint + format check together (what CI runs)
pnpm check
```

Husky runs `lint-staged` on every commit automatically (see
`.husky/pre-commit`), so most formatting issues are caught before you even open
a pull request.

### 3. Testing

```bash
# From frontend/
pnpm test

# From s3-api/
pnpm test
pnpm test:watch
pnpm test:coverage
```

Both packages use [Vitest](https://vitest.dev/). The `s3-api` suite mocks the
AWS SDK, so it needs no credentials and makes no network calls. There is no
end-to-end test suite in this repository today. See [Testing](./testing.md) for
what's actually covered and how to add to it.

## Working with Features

### Adding a New Feature

```bash
mkdir -p frontend/src/features/your-feature/{components,types}
mkdir -p frontend/src/features/your-feature/components/{ui,views,layout}
touch frontend/src/features/your-feature/components/index.ts
```

Look at an existing feature (`frontend/src/features/dashboard`) for the pattern
before starting a new one.

### Component Template

```typescript
'use client';

import { cn } from '@/lib/utils';

interface YourComponentProps {
  className?: string;
}

export function YourComponent({ className, ...props }: YourComponentProps) {
  return (
    <div className={cn('base-styles', className)} {...props}>
      {/* component content */}
    </div>
  );
}
```

## Styling Guidelines

The project uses Tailwind CSS with CSS custom properties for theming, plus
[shadcn/ui](https://ui.shadcn.com/) (configured in `frontend/components.json`)
for component primitives.

```typescript
<div className="bg-background text-foreground border border-border">
  <h1 className="text-2xl font-semibold text-primary">Title</h1>
  <p className="text-muted-foreground">Description</p>
</div>
```

These classes adapt automatically between light and dark mode - there's no
separate dark-mode variant to write by hand.

## S3 Integration

Opndrive talks to S3 directly from the browser through the `@opndrive/s3-api`
package, wrapped by `frontend/src/services/`. There is no backend server in
between. See [S3 API Layer](./s3-api.md) for what the package actually exposes
(upload managers, multipart uploads, retry/concurrency helpers).

## Debugging

### Common Issues and Solutions

**Module Resolution Errors**

```bash
rm -rf .next
pnpm dev
```

**TypeScript Errors**

Restart the TS server in VS Code: `Cmd/Ctrl + Shift + P` → "TypeScript: Restart
TS Server"

**Styling Not Applied**

```bash
pnpm dev
```

### Development Tools

- **React DevTools** - Browser extension for React debugging
- **Next.js DevTools** - Built-in development overlay
- **Tailwind CSS DevTools** - Browser extension for CSS debugging

## Common Commands Reference

These are the scripts that actually exist in `package.json` today:

| Command              | Where to run it                 | What it does                                         |
| -------------------- | ------------------------------- | ---------------------------------------------------- |
| `pnpm dev`           | `frontend/`                     | Start the dev server (Turbopack)                     |
| `pnpm build`         | `frontend/`                     | Production build                                     |
| `pnpm start`         | `frontend/`                     | Start the production build                           |
| `pnpm typecheck`     | root, `frontend/`, or `s3-api/` | Type-check (root runs both packages)                 |
| `pnpm test`          | `frontend/` or `s3-api/`        | Run the Vitest suite                                 |
| `pnpm test:watch`    | `s3-api/`                       | Run tests in watch mode                              |
| `pnpm test:coverage` | `s3-api/`                       | Run tests with a v8 coverage report                  |
| `pnpm lint`          | root                            | Lint both `frontend/` and `s3-api/`                  |
| `pnpm lint:frontend` | root                            | Lint only `frontend/`                                |
| `pnpm format`        | root                            | Format the whole repo with Prettier                  |
| `pnpm format:check`  | root                            | Check formatting without writing                     |
| `pnpm check`         | root                            | `lint` + `format:check` (what CI's quality job runs) |

There's no `type-check` (hyphenated), `check-all`, `clean`, or
environment-specific build script (`build:dev`/`build:staging`/`build:prod`) in
this repo, and no `test:coverage` in `frontend/`. If you've seen those
referenced elsewhere, that's stale documentation - please open an issue.

---

**You're all set.** Continue to
[Repository Structure](./repository-structure.md) and
[Frontend Architecture](./frontend-architecture.md) to understand the codebase
in more depth.
