# Environment Variables

Opndrive reads a small, specific set of environment variables. **None of them
are AWS or S3 credentials** - those are entered through the app's UI at
`/connect` and stored in the browser's `localStorage` (see
[Connecting Storage](../guides/connecting-storage.md)). If you've configured
`NEXT_PUBLIC_AWS_*` variables somewhere expecting them to matter, they don't;
nothing in the codebase reads them.

## Core

| Variable                  | Required | Default                                                | Used for                                                  |
| ------------------------- | -------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`    | No       | `https://opndrive.app`                                 | `sitemap.ts`, `robots.ts`, SEO metadata                   |
| `NEXT_PUBLIC_ENABLE_BLOG` | No       | enabled (anything except the literal string `'false'`) | Toggles the `/blog` routes and their WordPress dependency |

## Blog Only (WordPress Integration)

These only matter if `NEXT_PUBLIC_ENABLE_BLOG` is left enabled - the blog is
backed by a headless WordPress instance over GraphQL:

| Variable                | Used for                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `WORDPRESS_GRAPHQL_URL` | The WordPress GraphQL endpoint the blog fetches from                                                                                |
| `WORDPRESS_AUTH_TOKEN`  | Auth token for that endpoint                                                                                                        |
| `REVALIDATE_SECRET`     | Shared secret checked by `app/api/revalidate/route.ts`, WordPress calls this to trigger on-demand revalidation when content changes |

If you're not working on the marketing/blog surface, you can set
`NEXT_PUBLIC_ENABLE_BLOG=false` and ignore this whole section.

## Local Development

There's no `.env.example` for the **frontend**. If you need
`NEXT_PUBLIC_SITE_URL` or the blog variables locally, create
`frontend/.env.local` yourself with just the ones you need - the app runs fine
with none of them set.

The one committed template is `s3-api/.env.example`, and it isn't for running
the app: it lists `ENVIRONMENT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_REGION`, and `BUCKET_NAME`, which only the credential-gated integration
suite in `s3-api/src/tests/` reads. That suite skips itself unless all of them
are set, so you can ignore the file entirely unless you're running those tests
against a real bucket. See [Testing](../development/testing.md).
