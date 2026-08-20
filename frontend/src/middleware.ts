import { NextRequest, NextResponse } from 'next/server';
import {
  STATIC_SECURITY_HEADERS,
  buildContentSecurityPolicy,
  cspHeaderName,
} from '@/lib/privacy/csp';

/**
 * Issues a per-request nonce and attaches the security headers.
 *
 * A nonce has to be unguessable and fresh for every response, which is why this
 * is middleware rather than a static `headers()` entry in next.config. The
 * trade is real and worth stating: pages that read the nonce are rendered per
 * request rather than served from the static cache. We take that cost because
 * the alternative is `'unsafe-inline'`, and this app keeps an AWS secret key in
 * localStorage where any injected script could read it.
 *
 * The nonce travels to the app on a request header, which is how the root
 * layout stamps it onto the one inline script we ship.
 */
export function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const isDevelopment = process.env.NODE_ENV === 'development';
  const reportOnly = process.env.CSP_REPORT_ONLY === 'true';

  // Behind a proxy the connection to Next is plain http even when the browser
  // is on https, so the forwarded header is what reflects what the user sees.
  const forwardedProtocol = request.headers.get('x-forwarded-proto');
  const isSecureRequest = forwardedProtocol
    ? forwardedProtocol.split(',')[0].trim() === 'https'
    : request.nextUrl.protocol === 'https:';

  const policy = buildContentSecurityPolicy({ nonce, isDevelopment, isSecureRequest });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set(cspHeaderName(reportOnly), policy);

  for (const [name, value] of STATIC_SECURITY_HEADERS) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  matcher: [
    /**
     * Everything except build output and static files.
     *
     * Hashed assets under _next/static cannot carry an XSS and are served from
     * the CDN, so running middleware over them would only add latency.
     */
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|logo.png|og-image.png|manifest.json|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
