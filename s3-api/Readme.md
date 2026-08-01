# @opndrive/s3-api

A lightweight, modular TypeScript wrapper around AWS S3, providing a pluggable
and extendable interface for interacting with S3-compatible object storage.
Built for [Opndrive](https://github.com/Opndrive/opndrive), and usable
standalone.

## Install

```bash
npm install @opndrive/s3-api
```

## Usage

```typescript
import { BYOS3ApiProvider } from '@opndrive/s3-api';

const api = new BYOS3ApiProvider(
  {
    accessKeyId: '...',
    secretAccessKey: '...',
    region: 'us-east-1',
    bucketName: '...',
    prefix: '',
    // endpoint: 'https://...' - set for S3-compatible services (MinIO, etc.)
  },
  'default'
);

const { files, folders } = await api.fetchDirectoryStructure('photos/', 50);
```

Supports directory listing, single and multipart uploads, presigned URLs,
downloads with progress, rename/move, batch delete, and search. See the full
[S3 API Layer](../docs/content/development/s3-api.md) reference for the complete
method list and the reasoning behind the trickier ones (`deleteBatch`,
`renameFolder`).

## Development

```bash
pnpm install
pnpm check           # typecheck + test
pnpm test:coverage   # text summary + HTML report in coverage/
pnpm build
```

Tests mock the AWS SDK with
[`aws-sdk-client-mock`](https://github.com/m-radzikowski/aws-sdk-client-mock),
so **no AWS credentials are needed** and nothing hits the network. Test files
live next to the code they cover (`foo.ts` → `foo.test.ts`) and import from
source, never from `dist/`. See the
[Testing guide](../docs/content/development/testing.md) for the mock patterns
and conventions.

See [Release Process](../docs/content/maintainers/release-process.md) for how
versions get published.
