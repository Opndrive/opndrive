/**
 * This package does not touch browser storage.
 *
 * The app that ships it publishes a list of everything it keeps in a browser,
 * and a test over there fails the build when the app writes a key that is not
 * on the list. That test reads the app's source. It cannot see in here - so
 * for as long as `MultipartUploader` wrote `upload:<file name>:<key>` to
 * `localStorage` after every part, the list was wrong and nothing said so.
 * Those entries named the user's files, were read back by nothing, and for any
 * upload that was interrupted they were never removed.
 *
 * So the rule is enforced here, where the write would be: no storage at all.
 * A library deciding on its own to persist something in its host's origin is
 * a decision the host never got to make. If a feature ever genuinely needs to
 * keep state between page loads, the caller should be handed the state and
 * left to store it somewhere it has accounted for.
 *
 * A static scan rather than a spy, for the reason the app's guard gives: a spy
 * only covers the code paths a test happens to run, and the write this is
 * aimed at is the one somebody adds without thinking to test it.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Resolved from this file, so the scan is right however the runner was started. */
const SRC_ROOT = dirname(fileURLToPath(import.meta.url));

/** Every way a page can leave something behind in the browser. */
const STORAGE_APIS = /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/;

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      sourceFiles(full, found);
      continue;
    }

    // Tests may stub storage to prove it is left alone.
    if (!/\.ts$/.test(entry) || /\.test\.ts$/.test(entry)) continue;

    found.push(full);
  }

  return found;
}

/** Comments are allowed to talk about storage; code is not allowed to use it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = sourceFiles(SRC_ROOT);

describe('browser storage', () => {
  // A scan that found no files would pass for the wrong reason.
  it('scans the package source', () => {
    expect(files.length, `no source files found under ${SRC_ROOT}`).toBeGreaterThan(5);
  });

  it('is never used by this package', () => {
    const offenders = files
      .filter((file) => STORAGE_APIS.test(withoutComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(SRC_ROOT, file).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });
});
