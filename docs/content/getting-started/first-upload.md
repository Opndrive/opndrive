---
description:
  'Connect your S3 bucket on the /connect page and upload your first file, with
  where your credentials are kept and what to check if connecting fails.'
---

# First Upload

With Opndrive running locally ([Installation](./installation.md)), connect your
S3 bucket and upload your first file.

![The Opndrive home page: the heading "Open-source web UI for S3, R2, MinIO and more" with the Get Started and Learn More buttons](../../public/screenshots/opndrive-landing-page-get-started.webp)

## 1. Connect Your Bucket

1. Click **Get Started** on the landing page. You'll land on `/connect`.
2. Fill in the form:
   - AWS Access Key ID
   - AWS Secret Access Key
   - AWS Region (for example `us-east-1`)
   - S3 Bucket Name
3. Click **Connect**. Opndrive verifies the credentials against the bucket, then
   redirects you to the dashboard.

![The connect form for Amazon S3, filled in with AWS's documented example access key, a masked secret, a bucket name and the us-east-1 region](../../public/screenshots/opndrive-connect-form-amazon-s3.webp)

Don't have an AWS account or bucket yet?

1. Create a free account at [aws.amazon.com](https://aws.amazon.com) (S3 has a
   free tier).
2. Create a bucket and generate access keys in the AWS console.
3. Give the bucket a CORS policy that allows the address you open Opndrive at.
   Without it the browser refuses every request and connecting fails with "Could
   not reach your storage". [Configure CORS](../guides/configure-cors.md) has
   the policy to paste.
4. Come back and connect through the form above.

Using Cloudflare R2, Wasabi, Backblaze B2, DigitalOcean Spaces or MinIO? Each
has its own page on [/connect](https://opndrive.app/connect) with its setup
steps; any other S3-compatible service uses the custom endpoint option. See
[Connecting Storage](../guides/connecting-storage.md).

## 2. Your Credentials, Your Browser

Opndrive has no backend and no database. Credentials you enter are stored in
your browser's `localStorage` and used to talk to S3 directly from there - they
never pass through an Opndrive-operated server. Click the user icon → **Clear
Session** at any time to remove them.

## 3. Upload a File

![The Opndrive dashboard on an empty bucket, with the New button for uploads at the top of the sidebar](../../public/screenshots/opndrive-dashboard-empty-bucket.webp)

From the dashboard, use the upload button (or drag a file onto the file list).
See [Uploading Files](../guides/uploading-files.md) for the different upload
methods (direct, multipart, signed URL) and when each is used.

## Switching Buckets or Accounts

1. Click the user icon → **Clear Session**.
2. Refresh - you'll land back on the home page.
3. Click **Get Started** again and enter the new credentials.

## Stopping and Restarting the Dev Server

```bash
# Stop: Ctrl+C in the terminal running `pnpm dev:frontend`

# Restart later:
cd opndrive
pnpm dev:frontend
```

## Troubleshooting

**Connecting fails** - Opndrive shows one of a few messages, such as "Could not
reach your storage" or "Those keys were rejected", and the browser console (F12)
names the cause.
[Fixing Connection Errors](../guides/fixing-connection-errors.md) goes through
each one. The most common is a missing CORS policy on the bucket, which
[Configure CORS](../guides/configure-cors.md) covers for every provider.

---

**Next**: [Codebase Tour](../development/codebase-tour.md) if you're planning to
contribute, or [Uploading Files](../guides/uploading-files.md) to go deeper on
the upload flow.
