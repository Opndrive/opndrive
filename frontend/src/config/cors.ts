/**
 * The CORS policy each provider needs before Opndrive can reach a bucket from
 * the browser, in the exact form that provider's console or command line takes.
 *
 * Everything in a policy is derived from what the app actually sends:
 *
 * - Methods: GET lists and downloads, HEAD reads object details, PUT uploads,
 *   copies and writes tags, POST starts and completes multipart uploads and
 *   deletes many objects at once, DELETE removes objects and aborts uploads.
 * - Request headers: every SDK call is signed, so it carries headers no browser
 *   sends unasked (authorization, x-amz-date, x-amz-content-sha256 and more).
 *   Each one triggers a preflight, and a policy without AllowedHeaders refuses
 *   that preflight - the app cannot even list the bucket.
 * - ExposeHeaders: ETag. A multipart upload reads each part's ETag from the
 *   response, and the browser hides any response header not exposed.
 *
 * Where a provider documents `"*"` for AllowedHeaders, the policy uses it.
 * Cloudflare R2 does not document it, and asks for the headers the client
 * sends to be listed, so R2 gets CORS_REQUEST_HEADERS instead.
 * cors-request-headers.test.ts checks that list against the real client.
 */

/** Every HTTP method the app sends to a bucket. */
export const CORS_ALLOWED_METHODS = ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'] as const;

/** Response headers the app has to read. */
export const CORS_EXPOSE_HEADERS = ['ETag'] as const;

/**
 * Every request header the app's S3 calls send that a preflight has to allow,
 * for providers that need them named.
 *
 * Recorded from the preflights a browser sent while connecting, listing,
 * uploading (single, multipart and presigned), creating a folder, renaming,
 * downloading, previewing and deleting one and many objects. Copies over 5 GiB
 * go through a multipart copy that no browser test can reach, so the headers
 * it adds (copy-source range and condition, storage class, tagging and the
 * content headers it carries over) are taken from s3-api/src/utils/copyObject.ts.
 *
 * A copy also carries the object's own metadata as x-amz-meta-<name> headers.
 * Those names are whatever the uploader chose, so they cannot be listed here.
 */
export const CORS_REQUEST_HEADERS = [
  'amz-sdk-invocation-id',
  'amz-sdk-request',
  'authorization',
  'cache-control',
  'content-disposition',
  'content-encoding',
  'content-type',
  'expires',
  'x-amz-checksum-crc32',
  'x-amz-content-sha256',
  'x-amz-copy-source',
  'x-amz-copy-source-if-match',
  'x-amz-copy-source-range',
  'x-amz-date',
  'x-amz-sdk-checksum-algorithm',
  'x-amz-storage-class',
  'x-amz-tagging',
  'x-amz-user-agent',
] as const;

export type CorsPolicyFormat = 'json' | 'xml' | 'shell';

export interface CorsPolicy {
  format: CorsPolicyFormat;
  /** The policy itself, ready to paste or save. */
  text: string;
  /**
   * Set when the policy is saved to a file and applied with a command, rather
   * than pasted into a console editor.
   */
  file?: {
    name: string;
    command: string;
  };
}

interface S3CorsRule {
  AllowedHeaders: string[];
  AllowedMethods: string[];
  AllowedOrigins: string[];
  ExposeHeaders: string[];
  MaxAgeSeconds: number;
}

/** One rule in the shape of Amazon S3's CORS configuration, keys in its order. */
function s3Rule(
  origin: string,
  allowedHeaders: readonly string[],
  maxAgeSeconds: number
): S3CorsRule {
  return {
    AllowedHeaders: [...allowedHeaders],
    AllowedMethods: [...CORS_ALLOWED_METHODS],
    AllowedOrigins: [origin],
    ExposeHeaders: [...CORS_EXPOSE_HEADERS],
    MaxAgeSeconds: maxAgeSeconds,
  };
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const xmlText = (value: string) => value.replace(/[&<>]/g, (ch) => XML_ESCAPES[ch]!);

/**
 * The S3 XML CORS configuration, elements in the order DigitalOcean's own
 * example lists them.
 */
function s3Xml(origin: string, maxAgeSeconds: number): string {
  return [
    '<CORSConfiguration>',
    '  <CORSRule>',
    `    <AllowedOrigin>${xmlText(origin)}</AllowedOrigin>`,
    ...CORS_ALLOWED_METHODS.map((method) => `    <AllowedMethod>${method}</AllowedMethod>`),
    `    <MaxAgeSeconds>${maxAgeSeconds}</MaxAgeSeconds>`,
    ...CORS_EXPOSE_HEADERS.map((header) => `    <ExposeHeader>${header}</ExposeHeader>`),
    '    <AllowedHeader>*</AllowedHeader>',
    '  </CORSRule>',
    '</CORSConfiguration>',
  ].join('\n');
}

/**
 * The S3 console, and every console that copied it, takes a JSON array of
 * rules. The S3 API and the AWS CLI take the same rules under "CORSRules".
 */
const consoleJson = (origin: string, allowedHeaders: readonly string[], maxAgeSeconds: number) =>
  json([s3Rule(origin, allowedHeaders, maxAgeSeconds)]);

const POLICIES: Record<string, (origin: string) => CorsPolicy> = {
  // S3 console, Permissions > Cross-origin resource sharing (CORS) > Edit.
  aws: (origin) => ({ format: 'json', text: consoleJson(origin, ['*'], 3000) }),

  // R2 dashboard, Settings > CORS Policy > Add CORS policy > JSON tab. Headers
  // named rather than "*": see CORS_REQUEST_HEADERS.
  cloudflare: (origin) => ({
    format: 'json',
    text: consoleJson(origin, CORS_REQUEST_HEADERS, 3600),
  }),

  // Wasabi console, Settings > Permissions > Cross-Origin Resource Sharing
  // (CORS) > Edit, which takes "a JSON array with rules defined as objects".
  wasabi: (origin) => ({ format: 'json', text: consoleJson(origin, ['*'], 3000) }),

  // Backblaze's own rule format has no operation for S3 POST, which multipart
  // uploads and multi-object deletes use. Its S3 API takes PutBucketCors "in
  // the same format as AWS S3", POST included, so the rules go in that way.
  backblaze: (origin) => ({
    format: 'json',
    text: json({ CORSRules: [s3Rule(origin, ['*'], 3600)] }),
    file: {
      name: 'cors.json',
      command:
        'aws s3api put-bucket-cors --bucket YOUR_BUCKET --cors-configuration file://cors.json --endpoint-url https://s3.YOUR_REGION.backblazeb2.com',
    },
  }),

  // MinIO Community Edition answers PutBucketCors with NotImplemented: CORS is
  // one comma-separated origin list for the whole server, "*" by default. The
  // api subsystem is applied live, so no restart is needed.
  minio: (origin) => ({
    format: 'shell',
    text: `mc admin config set myminio api cors_allow_origin="${origin}"`,
  }),

  // The Spaces control panel can add CORS rules but has no field for exposed
  // headers, and DigitalOcean says to use an XML file with s3cmd for options
  // the panel lacks, ExposeHeader among them.
  digitalocean: (origin) => ({
    format: 'xml',
    text: s3Xml(origin, 3000),
    file: {
      name: 'cors.xml',
      command: 's3cmd setcors cors.xml s3://YOUR_SPACE',
    },
  }),

  // The S3 console shape, which most compatible consoles accept.
  custom: (origin) => ({ format: 'json', text: consoleJson(origin, ['*'], 3000) }),
};

/**
 * The policy for a provider, with `origin` - the address Opndrive is opened
 * from - as its one allowed origin. Null for a provider with no policy.
 */
export function getCorsPolicy(providerId: string, origin: string): CorsPolicy | null {
  // Own keys only: 'toString' or 'constructor' must not find Object.prototype.
  return Object.hasOwn(POLICIES, providerId) ? POLICIES[providerId]!(origin) : null;
}
