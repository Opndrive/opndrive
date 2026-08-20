/**
 * The guard that keeps the privacy policy honest.
 *
 * It walks the source for anything that writes to browser storage, resolves
 * the key being written, and fails if that key is not in the registry. A new
 * `setItem` therefore cannot ship without either being disclosed in the
 * published policy or turning this test red.
 *
 * It is a static scan rather than a type-safe wrapper on purpose. A wrapper
 * only protects the developers who remember to use it, and the developer this
 * is aimed at is the one who reached straight for `localStorage.setItem`
 * without thinking about the policy at all.
 *
 * It earned its place immediately: the first run found `dashboard_sidebar_state`
 * being written and disclosed nowhere.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS, isRegisteredStorageKey } from './storage-keys';

const SRC_ROOT = join(process.cwd(), 'src');

/** The registry describes itself; scanning it would be circular. */
const IGNORED_FILES = ['lib/privacy/storage-keys.ts'];

/**
 * Call sites that hand through a key chosen by their caller rather than naming
 * one. These are plumbing, not new keys, and the real key is registered where
 * it is actually chosen.
 */
const GENERIC_ADAPTERS: ReadonlyArray<{ file: string; argument: string; realKeyFrom: string }> = [
  {
    file: 'features/upload/stores/use-delete-recovery-store.ts',
    argument: 'name',
    realKeyFrom: "the persist() name option, 'delete-recovery-storage'",
  },
];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__mocks__') continue;
      sourceFiles(full, found);
      continue;
    }

    if (!/\.tsx?$/.test(entry)) continue;
    // Tests set up their own fixtures and may use throwaway keys.
    if (/\.test\.tsx?$/.test(entry)) continue;

    const rel = relative(SRC_ROOT, full).replace(/\\/g, '/');
    if (IGNORED_FILES.includes(rel)) continue;

    found.push(full);
  }

  return found;
}

interface ResolvedKey {
  value: string;
  /** The key is built at runtime and `value` is only its static prefix. */
  dynamic: boolean;
}

/** A quoted literal, capturing whether it interpolates anything. */
function readLiteral(text: string): ResolvedKey | null {
  const match = text.trim().match(/^(['"`])([^'"`]*)\1/);
  if (!match) return null;

  const raw = match[2];
  const interpolation = raw.indexOf('${');

  return interpolation === -1
    ? { value: raw, dynamic: false }
    : { value: raw.slice(0, interpolation), dynamic: true };
}

/**
 * Resolves the first argument of a storage write to the key it will use.
 *
 * Covers every form this codebase actually uses: a literal, a const, a const
 * wrapped in useMemo, a default parameter value, and an object property. Each
 * of those was a real miss before it was handled.
 */
function resolveKey(argument: string, source: string): ResolvedKey | null {
  const direct = readLiteral(argument);
  if (direct) return direct;

  // `config.storageKey` resolves the same way as a bare `storageKey`.
  const name = argument
    .trim()
    .replace(/^.*[.?]/, '')
    .replace(/[^\w$]/g, '');
  if (!name) return null;

  const patterns = [
    // const KEY = 'x'   /   const KEY = useMemo(() => 'x', [])
    new RegExp(
      `(?:const|let|var)\\s+${name}\\s*(?::[^=]+)?=\\s*(?:useMemo\\(\\s*\\(\\)\\s*=>\\s*)?(['"\`])`
    ),
    // storageKey = 'x' as a default parameter, or a plain reassignment
    new RegExp(`\\b${name}\\s*=\\s*(['"\`])`),
    // storageKey: 'x' as an object property
    new RegExp(`\\b${name}\\s*:\\s*(['"\`])`),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (match) {
      const resolved = readLiteral(source.slice(match.index + match[0].length - 1));
      if (resolved) return resolved;
    }
  }

  return null;
}

/** Zustand's persist middleware names its slice, and that name is the key. */
function persistNames(source: string): string[] {
  if (!/\bpersist\s*\(/.test(source)) return [];

  return [...source.matchAll(/\bname\s*:\s*(['"`])([^'"`]*)\1/g)].map((match) => match[2]);
}

interface StorageWrite {
  file: string;
  raw: string;
  resolved: ResolvedKey | null;
}

function scan() {
  const writes: StorageWrite[] = [];
  const written = new Set<string>();
  const allSource: string[] = [];

  for (const file of sourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(SRC_ROOT, file).replace(/\\/g, '/');

    allSource.push(source);

    // Any receiver, so `dismissStore()?.setItem(...)` is caught too.
    for (const match of source.matchAll(/\.setItem\s*\(\s*([^,]+),/g)) {
      const resolved = resolveKey(match[1], source);

      writes.push({ file: rel, raw: match[1].trim(), resolved });
      if (resolved) written.add(resolved.value);
    }

    for (const name of persistNames(source)) {
      written.add(name);
    }

    // The consent cookie goes through document.cookie, not setItem.
    for (const match of source.matchAll(/document\.cookie\s*=\s*`?\$?\{?([A-Z_][A-Z_0-9]*)\}?/g)) {
      const resolved = resolveKey(match[1], source);
      if (resolved) written.add(resolved.value);
    }
  }

  return { writes, written, corpus: allSource.join('\n') };
}

const { writes, written, corpus } = scan();

function isGenericAdapter(write: StorageWrite): boolean {
  return GENERIC_ADAPTERS.some(
    (allowed) => allowed.file === write.file && allowed.argument === write.raw
  );
}

describe('the scan itself', () => {
  it('finds the writes it is meant to be guarding', () => {
    expect(writes.length).toBeGreaterThan(8);
  });

  // A key assembled at runtime cannot be checked, so it cannot be allowed
  // through. Make it a module constant and the scan will resolve it.
  it('resolves every key that gets written', () => {
    const unresolved = writes
      .filter((write) => write.resolved === null && !isGenericAdapter(write))
      .map((write) => `${write.file}: setItem(${write.raw}, ...)`);

    expect(
      unresolved,
      'a storage key must be a literal, or a constant declared in the same file'
    ).toEqual([]);
  });
});

describe('every key the code writes is disclosed', () => {
  it.each([...written].sort())('%s is in the registry', (key) => {
    expect(
      isRegisteredStorageKey(key),
      `"${key}" is written to browser storage but is missing from STORAGE_KEYS. ` +
        'Add it there with a purpose written for the privacy policy, which renders from that list.'
    ).toBe(true);
  });
});

describe('every disclosed key is still real', () => {
  // A key that has been removed from the app must not linger in a published
  // policy claiming we store something we no longer do.
  it('has no stale entries', () => {
    const stale = STORAGE_KEYS.filter((entry) => !corpus.includes(entry.key));

    expect(
      stale.map((entry) => entry.key),
      'these are disclosed in the privacy policy but appear nowhere in the source'
    ).toEqual([]);
  });
});

describe('registry shape', () => {
  it('has no duplicate keys', () => {
    const keys = STORAGE_KEYS.map((entry) => entry.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every entry a purpose and lifetime a reader could understand', () => {
    for (const entry of STORAGE_KEYS) {
      expect(entry.purpose.length, `${entry.key} needs a real purpose`).toBeGreaterThan(15);
      expect(entry.lifetime.length, `${entry.key} needs a real lifetime`).toBeGreaterThan(3);
      expect(entry.mechanisms.length).toBeGreaterThan(0);
    }
  });

  // Everything stored today is strictly necessary, which is precisely why the
  // site needs no consent banner. Adding a key that is not breaks that
  // argument, so it must not be a quiet one-line change.
  it('is entirely strictly necessary', () => {
    for (const entry of STORAGE_KEYS) {
      expect(entry.category).toBe('necessary');
    }
  });
});
