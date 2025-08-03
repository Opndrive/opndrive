# S3 API Wrapper

A lightweight, modular TypeScript wrapper around AWS S3, providing a pluggable
and extendable interface for interacting with S3-compatible object storage.

## Getting Started

### 1. Setup .env (refer .env.example)

### 2. Install dependencies

```bash
pnpm install
```

### 3. Run tests

```bash
pnpm test
```

### 4. To run any specific file

```bash
pnpm dev file.ts
```

## Credentials

Make sure to never commit your real AWS credentials. Use environment variables
or a .env file and access them safely in development.
