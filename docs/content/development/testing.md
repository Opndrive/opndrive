# Testing

An honest picture of test coverage today, not an aspirational one. The frontend
is still thin - three files. `s3-api` came out the other side of its coverage
push: every S3 operation, the upload managers, and the multipart uploader are
now exercised against a mocked AWS client, and CI enforces coverage thresholds
on the package.

## The Stack

- **[Vitest](https://vitest.dev/)** for both packages.
- **[React Testing Library](https://testing-library.com/react)** for the
  frontend's component/hook tests.
- **[`aws-sdk-client-mock`](https://github.com/m-radzikowski/aws-sdk-client-mock)**
  plus its
  **[Vitest matchers](https://github.com/stschulte/aws-sdk-client-mock-vitest)**
  for `s3-api`.
- No Jest, no Playwright, no Cypress.

## Running Tests

Run these from the repository root - PNPM workspace filters target each package,
so there's no need to `cd` anywhere:

```bash
pnpm test                                       # frontend suite (root shortcut)
pnpm --filter @opndrive/s3-api test
pnpm --filter @opndrive/s3-api test:watch
pnpm --filter @opndrive/s3-api test:coverage    # text summary + HTML report in s3-api/coverage/
```

**No AWS credentials are required.** `aws-sdk-client-mock` intercepts the SDK
below the command layer, so no test makes a network call, and the fake keys in
the suites are the AWS documentation examples. If a test run asks you for
credentials or hangs on a socket, something is wired up wrong - say so in the PR
rather than adding real keys.

The one exception is `s3-api/src/tests/byoS3.test.ts`, an integration suite that
talks to a real bucket. It **skips itself** unless `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `BUCKET_NAME`, and `AWS_REGION` are all set (see
`s3-api/.env.example`). CI never sets them, so it never runs there.

Coverage **is** gated for `s3-api`. `s3-api/vitest.config.ts` sets thresholds of
95% statements, 90% branches, 95% functions, and 95% lines, and the CI `s3-api`
job runs `test:coverage`, so a genuine drop in covered behaviour fails the
build. Branches sits lowest on purpose - the remaining gap is unreachable
defensive code (see the `DEAD CODE:` and `KNOWN BUG:` cases in
`multipartUploader.test.ts`), not missing tests. The job also publishes the
coverage table to the GitHub run summary via
`.github/scripts/coverage-summary.mjs`.

The frontend has no coverage gate and no `test:coverage` script.

## What's Actually Covered

**`s3-api`** — effectively the whole public surface:

- `src/index.listing.test.ts` — `fetchDirectoryStructure`, `fetchMetadata`,
  `listFromPrefix`, `search`
- `src/index.objects.test.ts` — `uploadWithPreSignedUrl`, `getSignedUrl`,
  `downloadFile`, `deleteFile`, `deleteBatch`, `createFolder`
- `src/index.rename.test.ts` — `moveFile`, `renameFile`, and `renameFolder`
  (guard rails, copy/verify/delete phases, and partial-failure behaviour)
- `src/index.multipart.test.ts` — `uploadMultipartParallely`
- `src/core/index.test.ts` — `S3Client` construction, the accessors, `debugLog`
- `src/utils/uploadManager.test.ts` and
  `src/utils/signedUrlUploadManager.test.ts` — queueing, pause/resume/cancel,
  status reporting, events, folder uploads
- `src/utils/multipartUploader.test.ts` and
  `src/utils/signedUrlUploader.test.ts` — the uploaders themselves
- `src/utils/concurrency.test.ts` — `forEachWithConcurrency`
- `src/tests/contentDisposition.test.ts` — the `Content-Disposition` builder, in
  depth (unicode, header injection, path stripping)

**`frontend`** — three files, and nothing else:

- `src/context/auth-context.test.tsx`
- `src/features/dashboard/hooks/use-search.test.tsx`
- `src/features/dashboard/services/download-service.test.ts`

If you're looking for "good first issue" territory, a test for an existing hook
or utility is a safe, high-value place to start.

## Writing an `s3-api` Test

The custom matchers are registered globally in `s3-api/vitest.setup.ts`, so
individual suites only need `mockClient`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BYOS3ApiProvider } from './index.js';

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset(); // stubs leak between tests otherwise
});

it('carries pagination through', async () => {
  s3Mock.on(ListObjectsV2Command).resolves({
    Contents: [{ Key: 'a.txt' }],
    NextContinuationToken: 'token-2',
  });

  const result = await api.fetchDirectoryStructure('photos/', 50);

  expect(result.nextToken).toBe('token-2');
  expect(s3Mock).toHaveReceivedCommandWith(ListObjectsV2Command, {
    Bucket: 'test-bucket',
    Delimiter: '/',
  });
});
```

Useful stubs: `.resolves(...)` for every call, `.resolvesOnce(...)` chained for
paginated flows, `.rejects(err)` to drive an error path.

### Conventions

1. **Collocate.** `foo.ts` → `foo.test.ts`, next to the source. Where one source
   file covers a lot of ground, split by topic rather than by file
   (`index.listing.test.ts`, `index.objects.test.ts`) - both still sit beside
   `src/index.ts`. `src/tests/` predates this and is not the pattern to copy.
2. **Import from source, never from `dist/`.** A `dist/` import silently tests
   the last build instead of your change, and coverage instruments nothing.
3. **Test our wrapper, not the AWS SDK.** Which command we build, how we map the
   response, what we do when it throws. Whether S3 itself paginates correctly is
   not our problem.
4. **Mock at the boundary** (`@opndrive/s3-api`, `next/navigation`), not deep
   inside your own code.
5. **Before you trust a new test, break the code it covers** and confirm it
   fails. A test that passes either way isn't testing anything.

### Two Gotchas

`toHaveReceivedCommandWith` does a **partial** match, so it can assert a
parameter's value but not its absence - `{ Delimiter: undefined }` requires the
key to be present and undefined, which is not the same as unset. For absence,
read the input directly:

```typescript
const input = s3Mock.commandCalls(ListObjectsV2Command)[0].args[0].input;
expect(input.Delimiter).toBeUndefined();
```

The positional matchers take the command **first**:
`toHaveReceivedNthCommandWith(Command, n, input)`.

## Type-checking Tests

`tsconfig.json` includes the collocated `*.test.ts` files, so `pnpm typecheck`
covers them. `pnpm build` uses `tsconfig.build.json`, which excludes them - test
files must never end up in `dist/` and get published.

The matcher types come from `src/vitest.d.ts`. `vitest.setup.ts` sits outside
`rootDir` and so isn't in the type-check program; without that declaration file
every matcher call would be a type error despite working at runtime.

## What a Real Test Here Looks Like

The frontend tests aren't smoke tests - they're regression tests written against
a specific, previously-real bug, and they mount real providers instead of
asserting against an isolated store. The comment above `auth-context.test.tsx`
explains _why_ it mounts the full `AuthProvider` rather than testing the store
in isolation: a store-only test would have passed even with the bug present,
because the defect was that nothing in the session lifecycle called the store's
cleanup function - not that the cleanup function itself was broken.

That's the bar worth aiming for: a test that would actually fail if the fix were
reverted.

The same idea shows up in `s3-api` as pinning tests for behaviour that is
_currently_ surprising. `fetchDirectoryStructure` catches every error and
returns an empty listing, which makes an `AccessDenied` indistinguishable from
an empty folder. There's a test asserting exactly that, with a comment saying it
records the behaviour rather than endorses it - so if someone fixes it, the
failing test is the prompt to update the callers too.
