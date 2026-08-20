/**
 * Content Security Policy.
 *
 * The reason this exists is specific: the user's AWS secret access key lives in
 * `localStorage`, so any script that manages to run on this origin can read it.
 * A policy document says we care about that. This is the part that enforces it.
 *
 * `script-src` is where the protection actually is. It is nonce-based with
 * `'strict-dynamic'`, which means only scripts carrying this request's nonce
 * run, plus whatever those scripts choose to load. Injected `<script>` tags and
 * inline event handlers from an XSS do not, because the attacker cannot guess
 * the nonce.
 *
 * `connect-src` is the honest weak spot, and worth being plain about rather
 * than pretending otherwise. Opndrive connects to storage the *user* supplies:
 * AWS, R2, Wasabi, MinIO, a self-hosted endpoint on any hostname at all. There
 * is no allowlist that can be written ahead of time without breaking the core
 * feature, so `https:` is the tightest honest value. It stops plaintext
 * exfiltration and nothing more. The same applies to `img-src`, `media-src`
 * and `frame-src`, which all load signed URLs from that same unknown host.
 *
 * So: this materially reduces the chance of a script running at all, and does
 * little to contain one that does. That is the trade a bring-your-own-storage
 * design forces, and it is why `script-src` is worth the strictness.
 */

export interface CspOptions {
  nonce: string;
  isDevelopment: boolean;
  /**
   * Whether this response is being served over https.
   *
   * When it is not, the page is already plaintext and forbidding plaintext
   * subresources protects nothing while breaking real setups: a self-hosted
   * MinIO on `http://localhost:9000` is neither `'self'` (different port) nor
   * `https:`, so a blanket policy blocks the app's core feature.
   */
  isSecureRequest: boolean;
}

/**
 * `'strict-dynamic'` makes browsers that support it ignore host allowlists, so
 * `https:` here is only a fallback for older browsers that ignore the keyword
 * instead. Both are needed for the policy to degrade sensibly.
 */
function scriptSrc({ nonce, isDevelopment }: CspOptions): string {
  const sources = [`'nonce-${nonce}'`, "'strict-dynamic'", 'https:', "'self'"];

  // React Refresh compiles modules with eval in development. Never in a build.
  if (isDevelopment) sources.push("'unsafe-eval'");

  return `script-src ${sources.join(' ')}`;
}

/**
 * Schemes a user-supplied storage endpoint is allowed to use.
 *
 * Over https this is `https:` only, so a bucket cannot be reached in plaintext.
 * Over http it also has to include `http:`, because the deployment is already
 * plaintext and the alternative is that local MinIO simply does not work.
 */
function remoteSchemes({ isSecureRequest }: CspOptions): string[] {
  return isSecureRequest ? ['https:'] : ['https:', 'http:'];
}

function connectSrc(options: CspOptions): string {
  // wss: is not needed by the app today, but S3-compatible endpoints are
  // user-supplied and some speak websockets, so it stays open.
  const sources = ["'self'", ...remoteSchemes(options), 'wss:', 'blob:', 'data:'];

  // The dev server's hot reload socket.
  if (options.isDevelopment) sources.push('ws:');

  return `connect-src ${sources.join(' ')}`;
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  const remote = remoteSchemes(options).join(' ');

  const directives = [
    "default-src 'self'",
    scriptSrc(options),
    connectSrc(options),
    // Tailwind and the theme bootstrap both set style attributes, and there is
    // no XSS value in locking styles while script-src holds.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${remote}`,
    `media-src 'self' blob: ${remote}`,
    "font-src 'self' data:",
    // The PDF preview frames a signed URL from the user's own bucket.
    `frame-src 'self' blob: ${remote}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  // Upgrading only means anything when the page itself arrived over https. On
  // a plaintext deployment it would rewrite the user's own http endpoint to a
  // port that is not listening.
  if (options.isSecureRequest) directives.push('upgrade-insecure-requests');

  return directives.join('; ');
}

/**
 * Rolling this out enforced from day one risks breaking something nobody
 * predicted. Setting CSP_REPORT_ONLY=true reports violations without blocking,
 * which is the safe way to find out.
 */
export function cspHeaderName(reportOnly: boolean): string {
  return reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
}

/** Headers that are cheap, uncontroversial, and unrelated to the nonce. */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<[string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['X-Frame-Options', 'DENY'],
  // No feature here needs any of these, and a compromised page should not be
  // able to reach for them either.
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()'],
];
