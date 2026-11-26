#!/usr/bin/env node
/**
 * Fails when a build contains analytics.
 *
 * A build made without NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST -
 * every default build, and the Docker image - is promised to contain no
 * analytics code, key or host, and so to make no analytics request. This
 * searches the built output for anything that would break that promise:
 *
 * - a PostHog project key, host, or the address events are sent to;
 * - Vercel Web Analytics or Speed Insights, which the site no longer uses.
 *
 * Usage: node check-no-analytics.mjs <build dir> [<build dir> ...]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
// Imported explicitly rather than relied on as a global: this file sits
// outside the lint config's Node-environment globs.
import process from 'node:process';

const say = (line) =>
  process.stdout.write(`${line}
`);
const complain = (line) =>
  process.stderr.write(`${line}
`);

const FORBIDDEN = [
  { pattern: /phc_[A-Za-z0-9]/, what: 'a PostHog project key' },
  { pattern: /posthog\.com/i, what: 'a PostHog host' },
  { pattern: /\/i\/v0\/e\//, what: 'the analytics sending code' },
  { pattern: /_vercel\/(insights|speed-insights)/, what: 'Vercel Analytics or Speed Insights' },
];

const TEXT_FILE = /\.(m?js|cjs|json|html|rsc|txt|css|map|body|meta)$/;

/** The build cache holds earlier builds, not this one. */
const SKIPPED_DIRS = new Set(['cache']);

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry)) yield* files(path);
    } else if (TEXT_FILE.test(entry)) {
      yield path;
    }
  }
}

const roots = process.argv.slice(2);
if (roots.length === 0) {
  complain('usage: check-no-analytics.mjs <build dir> [...]');
  process.exit(2);
}

let scanned = 0;
const found = [];

for (const root of roots) {
  for (const path of files(root)) {
    scanned++;
    const text = readFileSync(path, 'utf8');

    for (const { pattern, what } of FORBIDDEN) {
      if (pattern.test(text)) found.push(`${path}: ${what}`);
    }
  }
}

if (scanned === 0) {
  complain(`No build output found under ${roots.join(', ')}.`);
  process.exit(2);
}

if (found.length > 0) {
  complain('This build contains analytics, which a default build must not:');
  for (const line of found) complain(`  ${line}`);
  process.exit(1);
}

say(`No analytics in ${scanned} built files.`);
