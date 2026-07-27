# First Upload

With Opndrive running locally ([Installation](./installation.md)), connect your
S3 bucket and upload your first file.

<!-- SCREENSHOT: Opndrive landing page with the "Get Started" button -->

## 1. Connect Your Bucket

1. Click **Get Started** on the landing page. You'll land on `/connect`.
2. Fill in the form:
   - AWS Access Key ID
   - AWS Secret Access Key
   - AWS Region (for example `us-east-1`)
   - S3 Bucket Name
3. Click **Connect**. Opndrive verifies the credentials against the bucket, then
   redirects you to the dashboard.

<!-- SCREENSHOT: The /connect form -->

Don't have an AWS account or bucket yet?

1. Create a free account at [aws.amazon.com](https://aws.amazon.com) (S3 has a
   free tier).
2. Create a bucket and generate access keys in the AWS console.
3. Come back and connect through the form above.

Using a non-AWS S3-compatible service (MinIO, DigitalOcean Spaces)? See
[Connecting Storage](../guides/connecting-storage.md) for the custom-endpoint
option.

## 2. Your Credentials, Your Browser

Opndrive has no backend and no database. Credentials you enter are stored in
your browser's `localStorage` and used to talk to S3 directly from there - they
never pass through an Opndrive-operated server. Click the user icon → **Clear
Session** at any time to remove them.

## 3. Upload a File

<!-- SCREENSHOT: Dashboard with an empty bucket and the upload button visible -->

From the dashboard, use the upload button (or drag a file onto the file list).
See [Uploading Files](../guides/uploading-files.md) for the different upload
methods (direct, multipart, signed URL) and when each is used.

## Switching Buckets or Accounts

1. Click the user icon → **Clear Session**.
2. Refresh - you'll land back on the home page.
3. Click **Get Started** again and enter the new credentials.

## Stopping and Restarting the Dev Server

```bash
# Stop: Ctrl+C in the terminal running `pnpm dev`

# Restart later:
cd opndrive/frontend
pnpm dev
```

## Troubleshooting

**AWS/S3 connection errors** - double-check the access key, secret, region, and
that the bucket name is exact. Opndrive surfaces the S3 error message directly
in the UI, which is usually specific enough to point at the problem (wrong
region, insufficient IAM permissions, bucket doesn't exist).

---

**Next**: [Codebase Tour](../development/codebase-tour.md) if you're planning to
contribute, or [Uploading Files](../guides/uploading-files.md) to go deeper on
the upload flow.
