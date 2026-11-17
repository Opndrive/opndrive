/**
 * Static pages in public/ cannot run script.
 *
 * Every response goes out with a CSP that only runs scripts carrying that
 * request's nonce (see csp.ts and middleware.ts). React pages get the nonce
 * from the layout. A file in public/ is served as it is, so nothing can stamp
 * one on - its <script> tags and onclick handlers are blocked, silently, in
 * every browser that understands 'strict-dynamic'.
 *
 * That is not hypothetical. The PDF preview was a page in here that loaded
 * pdf.js from a CDN, and in production it never ran: every PDF sat on
 * "Loading PDF..." until someone noticed. Anything that needs script belongs
 * in the app, where the bundle is trusted by the nonce.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Resolved from this file, so the scan is right however the runner was started. */
const PUBLIC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public');

function filesUnder(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) filesUnder(full, found);
    else found.push(full);
  }

  return found;
}

const files = filesUnder(PUBLIC_ROOT);
const htmlPages = files.filter((file) => /\.html?$/i.test(file));

/** A <script> element, or an on* handler attribute such as onclick="...". */
const SCRIPT = /<script\b|\son[a-z]+\s*=/i;

describe('static html in public/', () => {
  // An empty scan would pass for the wrong reason.
  it('scans the real public folder', () => {
    expect(files.length, `nothing found under ${PUBLIC_ROOT}`).toBeGreaterThan(5);
  });

  it('carries no script the CSP would block', () => {
    const offenders = htmlPages
      .filter((page) => SCRIPT.test(readFileSync(page, 'utf8')))
      .map((page) => relative(PUBLIC_ROOT, page).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });
});
