import { describe, expect, it } from 'vitest';
import { STATIC_SECURITY_HEADERS, buildContentSecurityPolicy, cspHeaderName } from './csp';

const NONCE = 'abc123def456';

function directive(policy: string, name: string): string {
  const found = policy.split('; ').find((part) => part.startsWith(`${name} `) || part === name);

  if (!found) throw new Error(`missing directive: ${name}`);

  return found;
}

const production = buildContentSecurityPolicy({
  nonce: NONCE,
  isDevelopment: false,
  isSecureRequest: true,
});
const development = buildContentSecurityPolicy({
  nonce: NONCE,
  isDevelopment: true,
  isSecureRequest: false,
});
/** A self-hosted deployment served over plain http. */
const plaintext = buildContentSecurityPolicy({
  nonce: NONCE,
  isDevelopment: false,
  isSecureRequest: false,
});

describe('script-src, which is where the XSS protection actually is', () => {
  it('carries the request nonce', () => {
    expect(directive(production, 'script-src')).toContain(`'nonce-${NONCE}'`);
  });

  it('uses strict-dynamic so injected script tags cannot run', () => {
    expect(directive(production, 'script-src')).toContain("'strict-dynamic'");
  });

  // The entire point. Allowing inline script would make the rest theatre,
  // because the AWS secret key is sitting in localStorage on this origin.
  it('never allows unsafe-inline for scripts', () => {
    expect(directive(production, 'script-src')).not.toContain("'unsafe-inline'");
    expect(directive(development, 'script-src')).not.toContain("'unsafe-inline'");
  });

  // Styles are the deliberate exception, and only styles. Tailwind and the
  // theme bootstrap both set style attributes, and an attacker who can inject
  // CSS but not script cannot reach localStorage.
  it('allows unsafe-inline for styles only', () => {
    expect(directive(production, 'style-src')).toContain("'unsafe-inline'");

    const others = production
      .split('; ')
      .filter((part) => !part.startsWith('style-src'))
      .join('; ');

    expect(others).not.toContain("'unsafe-inline'");
  });

  it('never allows eval in a production build', () => {
    expect(directive(production, 'script-src')).not.toContain("'unsafe-eval'");
  });

  it('allows eval in development, where React Refresh needs it', () => {
    expect(directive(development, 'script-src')).toContain("'unsafe-eval'");
  });
});

describe('directives that must not break bring-your-own storage', () => {
  // Every one of these loads from a host the user supplies at runtime, so an
  // allowlist cannot be written ahead of time without breaking the product.
  it.each([
    ['connect-src', 'the S3 API call itself'],
    ['img-src', 'image previews from a signed URL'],
    ['media-src', 'audio and video previews'],
    ['frame-src', 'the PDF preview iframe'],
  ])('%s allows https for %s', (name) => {
    expect(directive(production, name)).toContain('https:');
  });

  it('allows blob and data urls the previewers build locally', () => {
    expect(directive(production, 'img-src')).toContain('blob:');
    expect(directive(production, 'img-src')).toContain('data:');
    expect(directive(production, 'worker-src')).toContain('blob:');
  });

  it('opens the dev websocket only in development', () => {
    expect(directive(development, 'connect-src')).toContain('ws:');
    expect(directive(production, 'connect-src').split(' ')).not.toContain('ws:');
  });
});

// The endpoint is whatever the user pastes in, and a self-hosted MinIO on
// http://localhost:9000 is neither 'self' (different port) nor https:. Getting
// this wrong silently breaks the app's entire reason to exist.
describe('plaintext deployments, where the storage endpoint is also http', () => {
  it.each(['connect-src', 'img-src', 'media-src', 'frame-src'])(
    '%s allows http when the page itself is http',
    (name) => {
      expect(directive(plaintext, name)).toContain('http:');
    }
  );

  it.each(['connect-src', 'img-src', 'media-src', 'frame-src'])(
    '%s still refuses http when the page is https',
    (name) => {
      expect(directive(production, name).split(' ')).not.toContain('http:');
    }
  );

  // It would rewrite the user's own http endpoint to a port nothing is
  // listening on, and protects nothing on a page already served in the clear.
  it('does not upgrade requests on a plaintext deployment', () => {
    expect(plaintext).not.toContain('upgrade-insecure-requests');
    expect(production).toContain('upgrade-insecure-requests');
  });

  it('keeps script-src strict either way', () => {
    expect(directive(plaintext, 'script-src')).toContain(`'nonce-${NONCE}'`);
    expect(directive(plaintext, 'script-src')).not.toContain("'unsafe-inline'");
  });
});

describe('directives that lock things down', () => {
  it.each([
    ["object-src 'none'", 'blocks plugin content'],
    ["base-uri 'self'", 'stops a base tag rewriting every relative url'],
    ["form-action 'self'", 'stops a form posting credentials elsewhere'],
    ["frame-ancestors 'none'", 'blocks clickjacking'],
  ])('sets %s', (expected) => {
    expect(production).toContain(expected);
  });

  it('falls back to self for anything not named', () => {
    expect(production).toContain("default-src 'self'");
  });
});

describe('rollout', () => {
  it('can report without blocking, for finding surprises safely', () => {
    expect(cspHeaderName(true)).toBe('Content-Security-Policy-Report-Only');
    expect(cspHeaderName(false)).toBe('Content-Security-Policy');
  });

  it('gives every request a different nonce', () => {
    const first = buildContentSecurityPolicy({
      nonce: 'one',
      isDevelopment: false,
      isSecureRequest: true,
    });
    const second = buildContentSecurityPolicy({
      nonce: 'two',
      isDevelopment: false,
      isSecureRequest: true,
    });

    expect(first).not.toBe(second);
  });
});

describe('static security headers', () => {
  it('sets the ones that cost nothing', () => {
    const names = STATIC_SECURITY_HEADERS.map(([name]) => name);

    expect(names).toContain('X-Content-Type-Options');
    expect(names).toContain('Referrer-Policy');
    expect(names).toContain('Permissions-Policy');
  });

  it('does not leak the full url to other origins', () => {
    const referrer = STATIC_SECURITY_HEADERS.find(([name]) => name === 'Referrer-Policy');

    expect(referrer?.[1]).toBe('strict-origin-when-cross-origin');
  });
});
