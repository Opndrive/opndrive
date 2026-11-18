---
description:
  'What each connection error in Opndrive means and how to fix it: blocked CORS
  requests, failed preflights, a missing ETag on large uploads,
  SignatureDoesNotMatch, AccessDenied, InvalidAccessKeyId, unrecognised errors
  and a wrong region or endpoint.'
---

# Fixing Connection Errors

When Opndrive cannot use your storage it shows one of five messages, and the
browser usually knows more: open the developer console (**F12**, then
**Console**) and look for the line about the request that failed. Find either
the message or the console line below.

This page is for using Opndrive. For problems while developing it, see
[Development Troubleshooting](../reference/troubleshooting.md).

## "Could not reach your storage"

No usable answer came back. To the app, a request the browser blocked for CORS
looks exactly like a dropped connection, so the console line decides which it
is.

### No 'Access-Control-Allow-Origin' header is present

Chrome's console line:

```text
Access to fetch at '<bucket URL>' from origin '<this site>' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

Firefox reports the same thing as
`Reason: CORS header 'Access-Control-Allow-Origin' missing`.

The bucket has no CORS rule that matches this request. That is either no policy
at all, or a policy whose allowed origin is not exactly the address you opened
Opndrive at (scheme, host and port must match, with no path or trailing slash),
or a rule that does not allow the method or headers the request uses. Amazon S3
then refuses the preflight without any CORS headers, and the browser reports it
this way.

**Fix:** apply the policy for your provider from
[Configure CORS](./configure-cors.md), with your address as the allowed origin.
On MinIO, and on Wasabi until a bucket has a policy of its own, CORS allows
every origin by default, so this means it has been restricted; the guide covers
adding Opndrive's address back.

### Response to preflight request doesn't pass access control check: It does not have HTTP ok status

```text
Access to fetch at '<bucket URL>' from origin '<this site>' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: It does not have HTTP ok status.
```

The preflight reached something that answered with an error status. Check that
the endpoint is the provider's S3 API address and not its web console or a
public file URL, then check the CORS policy as above.

### Request header field … is not allowed by Access-Control-Allow-Headers in preflight response

```text
Access to fetch at '<bucket URL>' from origin '<this site>' has been blocked by CORS policy: Request header field x-amz-date is not allowed by Access-Control-Allow-Headers in preflight response.
```

Firefox:
`Reason: missing token 'x-amz-date' in CORS header 'Access-Control-Allow-Headers' from CORS preflight channel`.

A rule matched, but its allowed headers do not include one Opndrive sends. Use
`*` where the provider supports it, or add the header the message names; the
Cloudflare R2 policy in [Configure CORS](./configure-cors.md#cloudflare-r2)
lists every header Opndrive sends.

### Method PUT is not allowed by Access-Control-Allow-Methods in preflight response

```text
Access to fetch at '<bucket URL>' from origin '<this site>' has been blocked by CORS policy: Method PUT is not allowed by Access-Control-Allow-Methods in preflight response.
```

The rule does not allow a method Opndrive uses. Allow all five: GET, PUT, POST,
DELETE and HEAD. A rule missing POST lets small uploads through but stops
multipart uploads and deleting several files at once.

### Failed to fetch, with no CORS line

The request never reached anything that answered. The console shows a network
error instead, such as `net::ERR_NAME_NOT_RESOLVED` for an endpoint host that
does not exist or `net::ERR_CONNECTION_REFUSED` for a server that is not
listening. Check the endpoint address and your connection.

On an `https://` page such as opndrive.app, Opndrive's security policy upgrades
an `http://` endpoint to `https://`. A MinIO server without TLS is then
unreachable from the hosted app: put TLS in front of it, or
[self-host Opndrive](../getting-started/deployment.md) and open it over `http`
on the same network.

## Large uploads fail or keep retrying at the end (ETag not exposed)

Opndrive shows no message of its own for this one. Small files upload, but
larger ones, which go up in parts, fail at the last step, and Opndrive may keep
retrying it. Each part uploads fine, but the browser hides the part's `ETag`
response header unless the CORS policy exposes it, and finishing a multipart
upload needs it. Amazon S3's documentation for completing an upload: "For each
part in the list, you must provide the `PartNumber` value and the `ETag` value
that are returned after that part was uploaded."

**Fix:** add `ETag` to the exposed headers. Every policy in
[Configure CORS](./configure-cors.md) already has it. MinIO Community Edition
exposes `ETag` in its own CORS answers, so with MinIO this points at something
in front of it that answers CORS instead, such as a reverse proxy; expose `ETag`
there.

## "Those keys were rejected"

Your provider did not accept the access key or secret.

### InvalidAccessKeyId

Amazon S3: "The AWS access key ID you provided does not exist in our records."
Check the access key ID for a typo or a stray space, and that the key has not
been deleted.

### SignatureDoesNotMatch

Amazon S3: "The request signature we calculated does not match the signature you
provided. Check your AWS secret access key and signing method." The secret does
not belong to the access key ID. Paste it again, watching for leading or
trailing spaces.

### AuthorizationHeaderMalformed: the region is wrong

```text
The authorization header is malformed; the region 'us-east-1' is wrong; expecting 'eu-west-1'
```

The request was signed for a different region from the bucket's. Opndrive files
this under "Those keys were rejected", but the keys are fine: pick the region
the bucket was created in.

### ExpiredToken and TokenRefreshRequired

Amazon S3: "The provided token has expired." and "The provided token must be
refreshed." These come with temporary credentials that carry a session token;
connect again with current keys.

### Also filed here

Opndrive also shows "Those keys were rejected" for `InvalidClientTokenId`,
`UnrecognizedClientException` and any other answer with HTTP status 401.

## "That bucket was not found"

The keys worked, but the bucket did not answer as expected.

### NoSuchBucket

Amazon S3: "The specified bucket does not exist." Check the bucket name, which
must match exactly.

### PermanentRedirect

Amazon S3: "The bucket you are attempting to access must be addressed using the
specified endpoint." The bucket exists, but in another region or behind another
endpoint. See [Wrong region or endpoint](#wrong-region-or-endpoint).

### Also filed here

Opndrive also shows "That bucket was not found" for
`AuthorizationQueryParameters` and for any other answer with HTTP status 404.

## "These keys are not allowed to do that"

### AccessDenied

Amazon S3 answers "Access Denied". The provider recognised the key, but its
policy does not allow the request. Give the key list, read, write and delete on
the bucket, as listed in
[Required IAM Permissions](./connecting-storage.md#required-iam-permissions) and
in the setup guide on each provider's page.

### AllAccessDisabled and AccountProblem

Amazon S3: "All access to this Amazon S3 resource has been disabled." and "There
is a problem with your AWS account that prevents the action from completing
successfully." Both say to contact AWS Support; nothing in Opndrive or the
bucket's settings can fix them. Opndrive also shows this message for any other
answer with HTTP status 403.

## "Something went wrong reaching your storage"

The provider answered, but with an error Opndrive does not recognise, such as a
server error. Opndrive says so rather than guessing. Try again; if it keeps
happening, the browser console shows the request and the provider's own message,
and the provider's status page may show an outage.

## Wrong Region or Endpoint

| Provider            | S3 API endpoint                                 | Region                                     |
| ------------------- | ----------------------------------------------- | ------------------------------------------ |
| Amazon S3           | Chosen for you from the region                  | Where the bucket was created               |
| Cloudflare R2       | `https://<account-id>.r2.cloudflarestorage.com` | Almost always `auto`                       |
| Wasabi              | `https://s3.<region>.wasabisys.com`             | The bucket's region                        |
| Backblaze B2        | `https://s3.<region>.backblazeb2.com`           | The bucket's region, such as `us-west-002` |
| DigitalOcean Spaces | `https://<region>.digitaloceanspaces.com`       | The Space's datacenter, such as `nyc3`     |
| MinIO               | Your server's address                           | Usually `us-east-1`                        |

- **Amazon S3, wrong region:** `AuthorizationHeaderMalformed`, shown as "Those
  keys were rejected", or `PermanentRedirect`, shown as "That bucket was not
  found".
- **Cloudflare R2, a custom domain as the endpoint:** Cloudflare documents that
  signed requests work only on the S3 API domain, not on a custom domain.
- **Any provider, a console or public file URL as the endpoint:** these do not
  speak the S3 API. The connection fails with "Could not reach your storage" or
  "That bucket was not found".

## Still Stuck?

Open an issue on [GitHub](https://github.com/Opndrive/opndrive/issues) with the
message Opndrive showed and the console line, with your bucket name and keys
removed, or ask on [Discord](https://discord.gg/5t5yMy5NUd).
