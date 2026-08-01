/**
 * Publishes the s3-api coverage table to the GitHub Actions run summary page.
 *
 * Run from the s3-api package directory, after `pnpm test:coverage` has written
 * coverage/coverage-summary.json. Outside CI it just prints to stdout, so it
 * can be checked locally without faking GitHub's environment.
 *
 * This is deliberately a file rather than an inline `node -e` in the workflow:
 * quoting a multi-line script inside YAML is fragile and impossible to test.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
// Imported explicitly rather than relied on as a global: this file sits
// outside the lint config's Node-environment globs.
import process from 'node:process';

const REPORT = 'coverage/coverage-summary.json';
const CONFIG = 'vitest.config.ts';
const METRICS = ['statements', 'branches', 'functions', 'lines'];

function publish(markdown) {
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target) appendFileSync(target, `${markdown}\n`);
  else process.stdout.write(`${markdown}\n`);
}

/**
 * Reads the enforced thresholds out of vitest.config.ts rather than hardcoding
 * them here. Duplicating the numbers would let this table advertise a limit
 * that is not the one CI actually enforces - the exact drift the CODEOWNERS
 * rule on that file exists to prevent.
 */
function readThresholds() {
  try {
    const block = /thresholds:\s*\{([^}]*)\}/.exec(readFileSync(CONFIG, 'utf8'))?.[1] ?? '';
    return Object.fromEntries(
      METRICS.map((metric) => [
        metric,
        Number(new RegExp(`${metric}:\\s*(\\d+(?:\\.\\d+)?)`).exec(block)?.[1]),
      ])
    );
  } catch {
    return {};
  }
}

if (!existsSync(REPORT)) {
  // The gate step runs with `if: always()`, so this is reachable whenever the
  // suite dies before coverage is written. Say so plainly instead of crashing
  // and masking the real failure.
  publish('### s3-api coverage\n\nNo coverage report was produced — the test run failed early.');
  process.exit(0);
}

const { total } = JSON.parse(readFileSync(REPORT, 'utf8'));
const limits = readThresholds();

const rows = METRICS.map((metric) => {
  const { pct, covered, total: count } = total[metric];
  const limit = limits[metric];
  const known = Number.isFinite(limit);
  const status = known ? (pct >= limit ? '✅' : '❌') : '–';
  const label = metric[0].toUpperCase() + metric.slice(1);
  return `| ${label} | ${pct.toFixed(2)}% | ${covered}/${count} | ${known ? `${limit}%` : '–'} | ${status} |`;
});

publish(
  [
    '### s3-api coverage',
    '',
    '| Metric | Covered | Ratio | Threshold | Status |',
    '| --- | ---: | ---: | ---: | :-: |',
    ...rows,
  ].join('\n')
);
