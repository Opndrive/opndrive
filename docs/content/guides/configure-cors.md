---
description:
  'The CORS policy Opndrive needs on Amazon S3, Cloudflare R2, Wasabi, Backblaze
  B2, DigitalOcean Spaces, MinIO and other S3-compatible storage, and how to
  apply each one.'
---

# Configure CORS

Opndrive runs in your browser and talks to your storage directly, so the bucket
has to allow requests from the address you open Opndrive at. That permission is
the bucket's CORS (cross-origin resource sharing) policy. Without it the browser
refuses every request, and connecting fails with **"Could not reach your
storage"**.

Every policy on this page is the one the setup guide on each provider's
[/connect](https://opndrive.app/connect) page gives you, and is written for
`https://opndrive.app`. If you run your own copy of Opndrive, put its address in
place of that one. The setup guide fills in the address you are on by itself.

## What the Policy Has to Allow

| Part            | Value                            | Why                                                                                                                                                                          |
| --------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Allowed origins | The address you open Opndrive at | The browser sends it as `Origin` and the bucket must match it.                                                                                                               |
| Allowed methods | GET, PUT, POST, DELETE, HEAD     | Listing and downloads use GET, file details HEAD, uploads and copies PUT, multipart uploads and deleting several files POST, deletes DELETE.                                 |
| Allowed headers | `*`, or the list below           | Every request is signed, so it carries headers such as `authorization`, `x-amz-date` and `x-amz-content-sha256` that the browser checks with the bucket first (a preflight). |
| Exposed headers | `ETag`                           | Large files upload in parts, and finishing the upload needs each part's `ETag`, which the browser hides unless it is exposed.                                                |

A policy with no allowed headers fails the very first request: Opndrive cannot
even list the bucket.

## Amazon S3

Open the S3 console, choose **General purpose buckets** and then your bucket,
and open the **Permissions** tab. In the **Cross-origin resource sharing
(CORS)** section choose **Edit**, paste the policy, and choose **Save changes**.

<!-- prettier-ignore-start -->
<!-- cors-policy:aws -->
```json
[
  {
    "AllowedHeaders": [
      "*"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "HEAD"
    ],
    "AllowedOrigins": [
      "https://opndrive.app"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3000
  }
]
```
<!-- prettier-ignore-end -->

Setup page: [Connect to Amazon S3](https://opndrive.app/connect/aws-s3).

## Cloudflare R2

In the Cloudflare dashboard, go to **R2 object storage** and choose your bucket.
Open **Settings**, and under **CORS Policy** choose **Add CORS policy**. Paste
the policy into the **JSON** tab and choose **Save**. A change can take up to 30
seconds to apply.

Cloudflare's documentation does not say that R2 accepts `*` for allowed headers;
it asks for the headers the client sends to be listed. So this policy lists
every header Opndrive sends. One case it cannot cover: renaming a file over 5
GiB that carries custom metadata sends that metadata as `x-amz-meta-<name>`
headers, and those names have to be added by hand.

<!-- prettier-ignore-start -->
<!-- cors-policy:cloudflare -->
```json
[
  {
    "AllowedHeaders": [
      "amz-sdk-invocation-id",
      "amz-sdk-request",
      "authorization",
      "cache-control",
      "content-disposition",
      "content-encoding",
      "content-type",
      "expires",
      "x-amz-checksum-crc32",
      "x-amz-content-sha256",
      "x-amz-copy-source",
      "x-amz-copy-source-if-match",
      "x-amz-copy-source-range",
      "x-amz-date",
      "x-amz-sdk-checksum-algorithm",
      "x-amz-storage-class",
      "x-amz-tagging",
      "x-amz-user-agent"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "HEAD"
    ],
    "AllowedOrigins": [
      "https://opndrive.app"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```
<!-- prettier-ignore-end -->

Setup page:
[Connect to Cloudflare R2](https://opndrive.app/connect/cloudflare-r2).

## Wasabi

In the Wasabi Console, open **Buckets** and choose your bucket, then
**Settings**. On the **Permissions** tab, choose **Cross-Origin Resource Sharing
(CORS)** at the bottom, then **Edit**, and paste the policy.

Until a bucket has a CORS configuration of its own, Wasabi answers every origin,
so this matters once one has been saved.

<!-- prettier-ignore-start -->
<!-- cors-policy:wasabi -->
```json
[
  {
    "AllowedHeaders": [
      "*"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "HEAD"
    ],
    "AllowedOrigins": [
      "https://opndrive.app"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3000
  }
]
```
<!-- prettier-ignore-end -->

Setup page: [Connect to Wasabi](https://opndrive.app/connect/wasabi).

## Backblaze B2

Backblaze's own CORS rule format, the one the `b2` command-line tool uses, has
operations for S3 GET, HEAD, PUT and DELETE but none for POST, which multipart
uploads and deleting several files at once need. Its S3-compatible API takes
`PutBucketCors` in the same format as Amazon S3, POST included, so apply the
rules that way: configure the AWS CLI with your B2 application key ID and key,
save the policy as `cors.json`, and run the command with your bucket name and
region.

<!-- prettier-ignore-start -->
<!-- cors-policy:backblaze -->
```json
{
  "CORSRules": [
    {
      "AllowedHeaders": [
        "*"
      ],
      "AllowedMethods": [
        "GET",
        "PUT",
        "POST",
        "DELETE",
        "HEAD"
      ],
      "AllowedOrigins": [
        "https://opndrive.app"
      ],
      "ExposeHeaders": [
        "ETag"
      ],
      "MaxAgeSeconds": 3600
    }
  ]
}
```
<!-- prettier-ignore-end -->

Then apply it:

<!-- prettier-ignore-start -->
<!-- cors-command:backblaze -->
```bash
aws s3api put-bucket-cors --bucket YOUR_BUCKET --cors-configuration file://cors.json --endpoint-url https://s3.YOUR_REGION.backblazeb2.com
```
<!-- prettier-ignore-end -->

Backblaze notes that the S3 API cannot change CORS rules that were created with
its native API.

Setup page:
[Connect to Backblaze B2](https://opndrive.app/connect/backblaze-b2).

## DigitalOcean Spaces

The Spaces control panel can add CORS rules (your Space, then **Settings**, then
**CORS Configurations**), but it has no field for exposed headers. DigitalOcean
points to an XML file applied with `s3cmd` for options the panel lacks:
configure `s3cmd` for Spaces, save the policy as `cors.xml`, and run the command
with your Space name.

<!-- prettier-ignore-start -->
<!-- cors-policy:digitalocean -->
```xml
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>https://opndrive.app</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>DELETE</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <MaxAgeSeconds>3000</MaxAgeSeconds>
    <ExposeHeader>ETag</ExposeHeader>
    <AllowedHeader>*</AllowedHeader>
  </CORSRule>
</CORSConfiguration>
```
<!-- prettier-ignore-end -->

Then apply it:

<!-- prettier-ignore-start -->
<!-- cors-command:digitalocean -->
```bash
s3cmd setcors cors.xml s3://YOUR_SPACE
```
<!-- prettier-ignore-end -->

Setup page:
[Connect to DigitalOcean Spaces](https://opndrive.app/connect/digitalocean-spaces).

## MinIO

MinIO Community Edition does not have per-bucket CORS: its `PutBucketCors`
answers `NotImplemented`. CORS is one comma-separated origin list for the whole
server, set by `MINIO_API_CORS_ALLOW_ORIGIN` or the `api cors_allow_origin`
setting, and it is `*` (every origin) by default. A server you have not changed
needs nothing here.

If it has been restricted, add Opndrive's address with `mc`, using your alias in
place of `myminio`. The `api` settings apply without a restart. The value
replaces the old list, so include every origin that should keep working,
separated by commas.

<!-- prettier-ignore-start -->
<!-- cors-policy:minio -->
```bash
mc admin config set myminio api cors_allow_origin="https://opndrive.app"
```
<!-- prettier-ignore-end -->

MinIO AIStor also supports per-bucket rules, set with `mc cors set` and an S3
XML CORS file.

Setup page: [Connect to MinIO](https://opndrive.app/connect/minio).

## Any Other S3-Compatible Service

Look for CORS, cross-origin or allowed origins in the bucket settings. Most
services accept the same JSON policy the S3 console does. Some take it only
through their CLI or API: with the AWS CLI that is `put-bucket-cors`, with the
same rules wrapped as `{"CORSRules": [...]}`.

<!-- prettier-ignore-start -->
<!-- cors-policy:custom -->
```json
[
  {
    "AllowedHeaders": [
      "*"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "HEAD"
    ],
    "AllowedOrigins": [
      "https://opndrive.app"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3000
  }
]
```
<!-- prettier-ignore-end -->

Setup page:
[Connect a custom endpoint](https://opndrive.app/connect/custom-endpoint).

## Checking It Worked

Connect from the [/connect](https://opndrive.app/connect) page. If it still
fails, [Fixing Connection Errors](./fixing-connection-errors.md) goes through
each message Opndrive shows and the browser console line that comes with it.
