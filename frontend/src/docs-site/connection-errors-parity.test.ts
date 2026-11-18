// @vitest-environment node
/**
 * The docs' Fixing Connection Errors page covers every message the app shows
 * and every error code the app files under them.
 *
 * Both lists come from lib/s3/connection-failure.ts, the classifier that
 * decides what the user sees. A message or code added there and not here
 * fails this test, so the page cannot quietly fall behind the app.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONNECTION_FAILURE_CODES, CONNECTION_FAILURE_TITLES } from '@/lib/s3/connection-failure';

const PAGE = readFileSync(
  fileURLToPath(
    new URL('../../../docs/content/guides/fixing-connection-errors.md', import.meta.url)
  ),
  'utf8'
).replace(/\r\n/g, '\n');

/** The page's section under a message's heading, failing clearly if it is missing. */
function sectionFor(kind: string): string {
  const title = CONNECTION_FAILURE_TITLES[kind as keyof typeof CONNECTION_FAILURE_TITLES];
  const start = PAGE.indexOf(`\n## "${title}"\n`);
  expect(start, `no section headed "${title}" on the page`).toBeGreaterThan(-1);
  const end = PAGE.indexOf('\n## ', start + 1);
  return PAGE.slice(start, end === -1 ? undefined : end);
}

describe('the Fixing Connection Errors page', () => {
  it.each(Object.entries(CONNECTION_FAILURE_TITLES))(
    'has a section for the %s message, under its exact words',
    (_kind, title) => {
      expect(PAGE).toContain(`\n## "${title}"\n`);
    }
  );

  it.each(
    Object.entries(CONNECTION_FAILURE_CODES).flatMap(([kind, { names }]) =>
      names.map((name) => [name, kind] as const)
    )
  )('names %s under the %s message', (name, kind) => {
    // As a heading of its own or in code: the whole word, in the right section.
    expect(sectionFor(kind)).toMatch(new RegExp(`\\b${name}\\b`));
  });

  it.each(Object.entries(CONNECTION_FAILURE_CODES))(
    'says which HTTP status also leads to the %s message',
    (kind, { status }) => {
      expect(sectionFor(kind)).toContain(`HTTP status ${status}`);
    }
  );
});
