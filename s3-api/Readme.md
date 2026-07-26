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
[S3 API Layer](../docs/development/s3-api.md) reference for the complete method
list and the reasoning behind the trickier ones (`deleteBatch`, `renameFolder`).

## Development

```bash
pnpm install
pnpm check   # typecheck + test
pnpm build
```

See [Release Process](../docs/maintainers/release-process.md) for how versions
get published.
