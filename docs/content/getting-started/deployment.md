# Deployment

Opndrive is a stateless Next.js app - it holds no server-side secrets and no
database, because AWS credentials live in the browser's `localStorage` (see
[Connecting Storage](../guides/connecting-storage.md)). That makes deployment
simple: anywhere that runs a Next.js app works.

## Vercel or Netlify

Point either platform at the `frontend/` directory as the project root (not the
repository root - this is a PNPM workspace with `frontend/`, `s3-api/`, and
`docs/`). Both auto-detect Next.js. Because `frontend/` depends on
`@opndrive/s3-api` via `workspace:*`, the install has to resolve against the
root `pnpm-lock.yaml`, so make sure the platform's monorepo/workspace detection
is on rather than installing inside `frontend/` alone.

## Docker

The `Dockerfile` is a multi-stage build (`node:22-alpine`) and lives at the
**repository root**. Build it from the root, not from `frontend/`:

```bash
docker build -t opndrive .
docker run -d --restart unless-stopped --name opndrive -p 3000:3000 opndrive
```

The context has to be the repository root because `frontend/` depends on
`@opndrive/s3-api` through the pnpm workspace and there is only one lockfile, at
the root. A build from inside `frontend/` cannot resolve either, which is why
the Dockerfile moved out of that directory.

The Dockerfile accepts a `BLOG_STATUS` build arg that sets
`NEXT_PUBLIC_ENABLE_BLOG` at build time:

```bash
docker build --build-arg BLOG_STATUS=true -t opndrive .
```

`NEXT_PUBLIC_*` values are inlined at build time, which is why this is a build
arg rather than something you pass to `docker run`. Note that `BLOG_STATUS=true`
on its own isn't enough: the blog pages prerender against WordPress, so
`WORDPRESS_GRAPHQL_URL` has to be available at build time too or the build
fails. Leave the default (`false`) unless you're deploying the marketing/blog
surface.

A pre-built image isn't published by this repository's CI today - there's no
Docker build/push step in `.github/workflows/`. If you've seen a
`docker run opndrive/opndrive:<tag>` command elsewhere, treat it as unverified
until you've confirmed that tag is current; building locally from the Dockerfile
above is the reliable path.

## Environment at Build Time

The only build-relevant env vars are `NEXT_PUBLIC_ENABLE_BLOG` and
`NEXT_PUBLIC_SITE_URL` (used for SEO metadata, `sitemap.ts`/`robots.ts`). See
[Environment Variables](../reference/environment-variables.md) - there's nothing
AWS-related to configure at deploy time; every user connects their own bucket
through the app's UI after it's running.
