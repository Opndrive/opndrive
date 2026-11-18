/**
 * The docs' Configure CORS guide and the app's setup guide give the same
 * policies, character for character.
 *
 * They are written for two audiences in two apps, so there are two copies.
 * This is what keeps them one policy: every block in the guide is checked
 * against getCorsPolicy for its provider, filled in with https://opndrive.app
 * as the guide is, and every provider the app knows has to be in the guide.
 *
 * It lives in the frontend's suite because the docs site has no test runner of
 * its own, and this is the suite CI runs.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getCorsPolicy } from '@/config/cors';
import { S3_PROVIDERS } from '@/config/providers';

// The suite runs from frontend/ (pnpm --filter frontend test); jsdom's
// import.meta.url is not a file URL, so the path is taken from there.
const GUIDE = readFileSync(
  resolve(process.cwd(), '../docs/content/guides/configure-cors.md'),
  'utf8'
).replace(/\r\n/g, '\n');

const ORIGIN = 'https://opndrive.app';

function blocks(kind: 'policy' | 'command'): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = new RegExp(
    `<!-- cors-${kind}:(\\w+) -->\\s*\`\`\`\\w+\\n([\\s\\S]*?)\\n\`\`\``,
    'g'
  );
  for (const [, id, body] of GUIDE.matchAll(pattern)) found.set(id!, body!);
  return found;
}

const policies = blocks('policy');
const commands = blocks('command');

describe('the Configure CORS guide', () => {
  it.each(S3_PROVIDERS.map((p) => [p.name, p.id] as const))(
    'gives %s the policy the app gives',
    (_name, id) => {
      const policy = getCorsPolicy(id, ORIGIN)!;
      expect(policies.get(id)).toBe(policy.text);
      if (policy.file) expect(commands.get(id)).toBe(policy.file.command);
      else expect(commands.has(id)).toBe(false);
    }
  );

  it('has no policy for a provider the app does not have', () => {
    const known = new Set(S3_PROVIDERS.map((p) => p.id));
    expect([...policies.keys()].filter((id) => !known.has(id))).toEqual([]);
  });
});
