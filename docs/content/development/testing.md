# Testing

An honest picture of test coverage today, not an aspirational one: it's thin,
it's Vitest-only, and there's no end-to-end suite. That's fine to build on, but
don't assume more coverage exists than actually does.

## The Stack

- **[Vitest](https://vitest.dev/)** for both packages.
- **[React Testing Library](https://testing-library.com/react)** for the
  frontend's component/hook tests.
- No Jest, no Playwright, no Cypress.

## Running Tests

```bash
cd frontend && pnpm test
cd s3-api && pnpm test          # or: pnpm test:watch
```

There's no `test:coverage` script and no enforced coverage threshold in either
`vitest.config.ts`.

## What's Actually Covered

- `frontend/src/context/auth-context.test.tsx`
- `frontend/src/features/dashboard/hooks/use-search.test.tsx`
- `s3-api/src/tests/byoS3.test.ts`

That's the entire test suite. Everything else in the frontend and most of
`s3-api` is currently untested. If you're looking for "good first issue"
territory, adding a test for an existing hook or utility function is a safe,
high-value place to start.

## What a Real Test Here Looks Like

The existing tests aren't smoke tests - they're regression tests written against
a specific, previously-real bug, and they mount real providers instead of
asserting against an isolated store:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { AuthProvider } from './auth-context';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard',
}));

vi.mock('@opndrive/s3-api', () => ({
  BYOS3ApiProvider: class {
    getS3Client() {
      return {};
    }
    getBucketName() {
      return 'test-bucket';
    }
  },
  // ...
}));
```

The comment above the real version of this test explains _why_ it mounts the
full `AuthProvider` rather than testing the store in isolation: a store-only
test would have passed even with the bug present, because the defect was that
nothing in the session lifecycle called the store's cleanup function - not that
the cleanup function itself was broken. That's the bar worth aiming for: a test
that would actually fail if the fix were reverted, not one that happens to pass
either way.

## Adding a Test

1. Put it next to the code it tests (`foo.ts` → `foo.test.ts`), matching the two
   existing examples.
2. Mock at the boundary (`@opndrive/s3-api`, `next/navigation`), not deep inside
   your own code.
3. Before you trust a new test, revert the fix it's supposed to guard and
   confirm the test actually fails. A test that passes both with and without the
   bug isn't testing anything.
