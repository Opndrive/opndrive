# Repository Structure

A map of the codebase as it exists today, not as originally planned - every path
below was checked against the actual filesystem.

## Root Directory

```
opndrive/
├── docs/                # This documentation site (Nextra) - content/ is the source of truth
├── frontend/                 # Next.js application
├── s3-api/                   # Published npm package: @opndrive/s3-api
├── CONTRIBUTING.md           # Short contributor entry point
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md              # Frontend app changes (s3-api has its own)
├── SECURITY.md               # How to report a vulnerability privately
├── LICENSE                   # AGPL-3.0
├── README.md
├── eslint.config.mjs         # Shared lint config for both packages
├── package.json              # Root scripts: lint, format, check, typecheck
├── pnpm-lock.yaml
└── prettier.config.js
```

There used to be a separate `docs/` folder at the root, copied verbatim into
`docs/content/`. It was removed - Nextra has no supported way to read content
from outside its own app directory, so a copy meant two places that could
silently drift out of sync. `docs/content/` is the only place these files live
now; it's still plain Markdown/MDX, so it reads fine directly on GitHub too.

There's no `pnpm-workspace.yaml` - each package manages its own `node_modules`
independently. That's a deliberate choice, not an oversight (see
[Dependency Policy](../maintainers/dependency-policy.md) for why it matters for
dependency updates).

## Frontend (`/frontend`)

```
frontend/
├── public/                   # Static assets
├── src/
│   ├── app/                  # Next.js App Router
│   ├── features/             # Feature-based modules
│   ├── shared/                # Reusable components and utilities
│   ├── components/            # Non-feature-specific components (file preview, etc.)
│   ├── context/                # React Context providers
│   ├── hooks/                  # Cross-feature custom hooks
│   ├── lib/                    # Utilities, config helpers
│   ├── config/                  # Feature flags and app config
│   ├── providers/                # App-level providers
│   ├── services/                  # Wrappers around @opndrive/s3-api
│   ├── types/                      # Shared TypeScript types
│   └── assets/                      # Local static assets
├── components.json            # shadcn/ui config
├── Dockerfile                  # Multi-stage build, node:22-alpine
├── next.config.ts
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

### App Router (`src/app`)

```
app/
├── layout.tsx                       # Root layout
├── page.tsx                         # Landing page
├── not-found.tsx
├── robots.ts / sitemap.ts           # SEO
├── connect/page.tsx                 # AWS credential setup wizard
├── blog/                            # page.tsx, [slug]/page.tsx, layout.tsx
├── api/revalidate/route.ts          # On-demand revalidation endpoint
└── dashboard/
    ├── layout.tsx / page.tsx        # Dashboard shell + home
    ├── browse/page.tsx              # File and folder browsing
    ├── search/page.tsx
    ├── settings/                    # layout.tsx, page.tsx
    └── preview/                     # layout.tsx, [etag]/page.tsx - route-based file preview
```

The blog and revalidate route are behind the `NEXT_PUBLIC_ENABLE_BLOG` flag (see
[Environment Variables](../reference/environment-variables.md)) and are a
separate marketing surface from the drive product itself - if you're working on
the dashboard, you can generally ignore them.

### Features (`src/features`)

```
features/
├── dashboard/           # Main file browser: components/, hooks/, services/, stores/, types/
├── upload/               # Upload flow: components/, hooks/, stores/
├── file-management/       # Rename/delete helpers
├── folder-navigation/       # Breadcrumb + prefix navigation logic
├── settings/                 # App settings and preferences
└── landing-page/               # Components specific to the marketing home page
```

Each feature owns its `components/`, and larger ones add `hooks/`, `stores/`
(Zustand), or `services/` as needed - there's no fixed template every feature
must follow, but `features/dashboard` is the most complete example to copy from.

### Shared (`src/shared`)

```
shared/
├── components/
│   ├── ui/          # Primitives: button, input, dialog, ... (shadcn/ui based)
│   ├── icons/        # File and folder type icons
│   └── layout/        # Cross-page layout pieces (loading bar, etc.)
```

## S3 API (`/s3-api`)

```
s3-api/
├── src/
│   ├── core/
│   │   ├── index.ts          # Abstract interface
│   │   └── types.ts
│   ├── utils/
│   │   ├── uploadManager.ts          # Multipart upload orchestration
│   │   ├── signedUrlUploadManager.ts # Signed-URL upload orchestration
│   │   ├── signedUrlUploader.ts
│   │   ├── multipartUploader.ts
│   │   └── concurrency.ts
│   ├── tests/                  # Credential-gated integration suite (skips by default)
│   ├── index.ts                # Public exports
│   ├── index.listing.test.ts   # Listing + metadata coverage
│   ├── index.objects.test.ts   # Single-object operation coverage
│   └── vitest.d.ts             # Types for the aws-sdk-client-mock matchers
├── CHANGELOG.MD
├── package.json                # Published as @opndrive/s3-api
├── tsconfig.json               # Type-checking (includes test files)
├── tsconfig.build.json         # Build only (excludes test files from dist/)
├── vitest.config.ts
└── vitest.setup.ts             # Registers the AWS mock matchers
```

Unit tests are collocated with the code they cover; `src/tests/` predates that
convention and now holds only the integration suite. See
[Testing](./testing.md).

See [S3 API Layer](./s3-api.md) for what each of these actually does.

## Import Aliasing

```typescript
// Good
import { Button } from '@/shared/components/ui/button';
import { FileItem } from '@/features/dashboard/types/file';
import { useDriveStore } from '@/context/data-context';

// Avoid
import { Button } from '../../../shared/components/ui/button';
```

## File Naming

kebab-case for files and folders throughout both packages.

## Where to Start Reading

1. `src/app` - see how pages map to routes.
2. `src/features/dashboard` - the most complete example of the feature pattern.
3. `src/shared/components/ui` - the primitives everything else is built from.
4. [Frontend Architecture](./frontend-architecture.md) for how these fit
   together.
