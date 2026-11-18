// @vitest-environment node
/**
 * The docs' Configure CORS guide and the app's setup guide give the same
 * policies, character for character.
 *
 * They are written for two audiences in two apps, so there are two copies.
 * This is what keeps them one policy: every block in the guide is checked
 * against getCorsPolicy for its provider, filled in with https://opndrive.app
 * as the guide is, and every provider the app knows has to be in the guide.
 * CI runs it for changes under docs/ as well as frontend/.
 *
 * It lives in the frontend's suite because the docs site has no test runner of
 * its own. Node environment, so the guide is found from this file's own
 * location whichever directory the suite is started from.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getCorsPolicy } from '@/config/cors';
import { S3_PROVIDERS } from '@/config/providers';

const GUIDE = readFileSync(
  fileURLToPath(new URL('../../../docs/content/guides/configure-cors.md', import.meta.url)),
  'utf8'
).replace(/\r\n/g, '\n');

const ORIGIN = 'https://opndrive.app';

/** Every block of a kind, by provider id, and the ids that appear more than once. */
function blocks(kind: 'policy' | 'command') {
  const found = new Map<string, string>();
  const repeated: string[] = [];
  const pattern = new RegExp(
    `<!-- cors-${kind}:(\\w+) -->\\s*\`\`\`\\w+\\n([\\s\\S]*?)\\n\`\`\``,
    'g'
  );
  for (const [, id, body] of GUIDE.matchAll(pattern)) {
    if (found.has(id!)) repeated.push(id!);
    found.set(id!, body!);
  }
  return { found, repeated };
}

/**
 * The guide's section that holds a provider's policy: from the heading before
 * its marker to the next heading. Found by the marker, so a heading can be
 * worded freely.
 */
function sectionOf(id: string): string {
  const marker = GUIDE.indexOf(`<!-- cors-policy:${id} -->`);
  expect(marker, `no policy block for ${id} in the guide`).toBeGreaterThan(-1);
  const start = GUIDE.lastIndexOf('\n## ', marker);
  const end = GUIDE.indexOf('\n## ', marker);
  return GUIDE.slice(start, end === -1 ? undefined : end);
}

const { found: policies, repeated: repeatedPolicies } = blocks('policy');
const { found: commands, repeated: repeatedCommands } = blocks('command');
const known = new Set(S3_PROVIDERS.map((p) => p.id));

describe('the Configure CORS guide', () => {
  it.each(S3_PROVIDERS.map((p) => [p.name, p.id] as const))(
    'gives %s the policy the app gives',
    (name, id) => {
      const policy = getCorsPolicy(id, ORIGIN);
      expect(policy, `the app has no CORS policy for ${name}`).not.toBeNull();
      expect(policies.get(id), `the guide has no policy block for ${name}`).toBe(policy!.text);

      if (policy!.file) {
        expect(commands.get(id)).toBe(policy!.file.command);
      } else {
        expect(commands.has(id)).toBe(false);
      }
    }
  );

  it.each(
    S3_PROVIDERS.filter((p) => getCorsPolicy(p.id, ORIGIN)?.file).map((p) => [p.name, p] as const)
  )('tells %s users to save the policy under the name the command reads', (_name, provider) => {
    const { file } = getCorsPolicy(provider.id, ORIGIN)!;

    expect(sectionOf(provider.id)).toContain(`\`${file!.name}\``);
    expect(file!.command).toContain(file!.name);
  });

  it('has one block of each kind per provider, not two', () => {
    expect(repeatedPolicies).toEqual([]);
    expect(repeatedCommands).toEqual([]);
  });

  it('has no policy or command block for a provider the app does not have', () => {
    expect([...policies.keys()].filter((id) => !known.has(id))).toEqual([]);
    expect([...commands.keys()].filter((id) => !known.has(id))).toEqual([]);
  });
});
