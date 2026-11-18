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

function blocks(kind: 'policy' | 'command'): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = new RegExp(
    `<!-- cors-${kind}:(\\w+) -->\\s*\`\`\`\\w+\\n([\\s\\S]*?)\\n\`\`\``,
    'g'
  );
  for (const [, id, body] of GUIDE.matchAll(pattern)) {
    expect(found.has(id!), `two cors-${kind} blocks for ${id}`).toBe(false);
    found.set(id!, body!);
  }
  return found;
}

/** The guide's section for a provider: from its heading to the next one. */
function section(heading: string): string {
  const start = GUIDE.indexOf(`\n## ${heading}\n`);
  expect(start, `no "## ${heading}" section in the guide`).toBeGreaterThan(-1);
  const end = GUIDE.indexOf('\n## ', start + 1);
  return GUIDE.slice(start, end === -1 ? undefined : end);
}

const policies = blocks('policy');
const commands = blocks('command');
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
    const heading = provider.id === 'custom' ? 'Any Other S3-Compatible Service' : provider.name;

    expect(section(heading)).toContain(`\`${file!.name}\``);
    expect(file!.command).toContain(file!.name);
  });

  it('has no policy or command block for a provider the app does not have', () => {
    expect([...policies.keys()].filter((id) => !known.has(id))).toEqual([]);
    expect([...commands.keys()].filter((id) => !known.has(id))).toEqual([]);
  });
});
