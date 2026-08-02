# FAQ

**Where are my AWS credentials stored?** In your browser's `localStorage`,
entered through the `/connect` form. Opndrive has no backend server and no
database, so there's nowhere else for them to go. See
[Connecting Storage](../guides/connecting-storage.md).

**Does Opndrive work with storage other than AWS S3?** Yes. AWS, Wasabi,
Backblaze B2, and Cloudflare R2 have built-in presets, and any other
S3-compatible endpoint (MinIO, DigitalOcean Spaces, ...) works by entering a
custom endpoint URL. See [Connecting Storage](../guides/connecting-storage.md).

**How many times do I run `pnpm install` when setting up?** Once, from the
repository root. The repo uses `pnpm-workspace.yaml`, so `pnpm install` installs
`frontend/`, `s3-api/`, and `docs/`, links the local `@opndrive/s3-api` package
into the frontend, and runs the root `prepare` script.

**What's the difference between multipart and signed-URL upload?** Multipart
supports pause/resume and handles large files better; signed-URL is a single
direct upload, faster for small files but cancel-only. See
[Uploading Files](../guides/uploading-files.md).

**Can I self-host Opndrive?** Yes - it's a stateless Next.js app. See
[Deployment](../getting-started/deployment.md) for Vercel, Netlify, and Docker.

**Does download show real progress, or can I cancel a download in progress?**
Not yet - the progress bar is currently simulated and the cancel control isn't
wired to the actual browser download. See
[Downloading Files](../guides/downloading-files.md) for the details (and if you
want to fix it, it's a good first contribution).

**Is there a workspace `pnpm-workspace.yaml`?** Yes. It lists `frontend/`,
`s3-api/`, and `docs/` as PNPM workspaces.

**What license is this under?** AGPL-3.0. See
[LICENSE](https://github.com/Opndrive/opndrive/blob/main/LICENSE).

**How do I report a security vulnerability?** Privately - see
[SECURITY.md](https://github.com/Opndrive/opndrive/blob/main/SECURITY.md). Don't
open a public issue for it.

**Something's not covered here.** Check [Troubleshooting](./troubleshooting.md),
then [open an issue](https://github.com/Opndrive/opndrive/issues) or a GitHub
Discussion.
