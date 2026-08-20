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
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS, isRegisteredStorageKey } from './storage-keys';

/**
 * Resolved from this file rather than `process.cwd()`.
 *
 * A guard that silently scans the wrong directory finds nothing, and finding
 * nothing is indistinguishable from finding no problems. This way the path is
 * correct however the runner was invoked.
 */
const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

/**
 * A quoted literal, capturing whether it interpolates anything.
 *
 * A template resolves to the static text before its first `${`, which is what
 * makes a scoped key like `dashboard_sidebar_state:${basePath}` checkable: the
 * prefix is the part the registry and the privacy policy can name.
 *
 * A template that *starts* with an interpolation has no such prefix, so it is
 * reported as unresolvable rather than being recorded as an empty key. The
 * empty-key version of this failure named no file and no key, which told a
 * developer nothing about what to fix.
 */
function readLiteral(text: string): ResolvedKey | null {
  const match = text.trim().match(/^(['"`])([^'"`]*)\1/);
  if (!match) return null;

  const raw = match[2];
  const interpolation = raw.indexOf('${');

  if (interpolation === -1) return { value: raw, dynamic: false };

  const prefix = raw.slice(0, interpolation);

  return prefix ? { value: prefix, dynamic: true } : null;
}

/**
 * Every key a storage write could be using.
 *
 * Returns a list rather than one value, and that is the important part.
 * `credit-warning-dialog.tsx` writes `config.storageKey` where `config` comes
 * from a map holding three different `storageKey` literals. Resolving only the
 * first would mean a fourth warning could add an undisclosed key without this
 * guard noticing, which is precisely the hole it exists to close.
 *
 * Covers every form this codebase uses: a literal, a const, a const wrapped in
 * useMemo, a default parameter value, and an object property. Each of those
 * was a real miss before it was handled.
 */
function resolveKeys(argument: string, source: string): ResolvedKey[] {
  const direct = readLiteral(argument);
  if (direct) return [direct];

  // `config.storageKey` resolves the same way as a bare `storageKey`.
  const name = argument
    .trim()
    .replace(/^.*[.?]/, '')
    .replace(/[^\w$]/g, '');
  if (!name) return [];

  // `$` is legal in an identifier and also a regex anchor, so it has to be
  // escaped before being interpolated into the patterns below.
  const safeName = name.replace(/\$/g, '\\$');

  const patterns = [
    // const KEY = 'x'   /   const KEY = useMemo(() => 'x', [])
    new RegExp(
      `(?:const|let|var)\\s+${safeName}\\s*(?::[^=]+)?=\\s*(?:useMemo\\(\\s*\\(\\)\\s*=>\\s*)?(['"\`])`,
      'g'
    ),
    // storageKey = 'x' as a default parameter, or a plain reassignment
    new RegExp(`\\b${safeName}\\s*=\\s*(['"\`])`, 'g'),
    // storageKey: 'x' as an object property
    new RegExp(`\\b${safeName}\\s*:\\s*(['"\`])`, 'g'),
  ];

  const found = new Map<string, ResolvedKey>();

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const resolved = readLiteral(source.slice(match.index + match[0].length - 1));
      if (resolved) found.set(resolved.value, resolved);
    }
  }

  return [...found.values()];
}

/** Zustand's persist middleware names its slice, and that name is the key. */
function persistNames(source: string): string[] {
  if (!/\bpersist\s*\(/.test(source)) return [];

  return [...source.matchAll(/\bname\s*:\s*(['"`])([^'"`]*)\1/g)].map((match) => match[2]);
}

interface StorageWrite {
  file: string;
  raw: string;
  resolved: ResolvedKey[];
}

function scan() {
  const writes: StorageWrite[] = [];
  const written = new Set<string>();
  /** Keys the code appends a runtime scope to, e.g. `key:${basePath}`. */
  const dynamic = new Set<string>();
  const allSource: string[] = [];

  for (const file of sourceFiles(SRC_ROOT)) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(SRC_ROOT, file).replace(/\\/g, '/');

    allSource.push(source);

    // Any receiver, so `dismissStore()?.setItem(...)` is caught too.
    for (const match of source.matchAll(/\.setItem\s*\(\s*([^,]+),/g)) {
      const resolved = resolveKeys(match[1], source);

      writes.push({ file: rel, raw: match[1].trim(), resolved });

      for (const key of resolved) {
        written.add(key.value);
        if (key.dynamic) dynamic.add(key.value);
      }
    }

    for (const name of persistNames(source)) {
      written.add(name);
    }

    // The consent cookie goes through document.cookie, not setItem.
    for (const match of source.matchAll(/document\.cookie\s*=\s*`?\$?\{?([A-Z_][A-Z_0-9]*)\}?/g)) {
      for (const key of resolveKeys(match[1], source)) {
        written.add(key.value);
        if (key.dynamic) dynamic.add(key.value);
      }
    }
  }

  return {
    writes,
    written,
    dynamic,
    corpus: allSource.join('\n'),
    scannedFiles: allSource.length,
  };
}

const { writes, written, dynamic, corpus, scannedFiles } = scan();

function isGenericAdapter(write: StorageWrite): boolean {
  return GENERIC_ADAPTERS.some(
    (allowed) => allowed.file === write.file && allowed.argument === write.raw
  );
}

describe('the scan itself', () => {
  // `it.each([])` generates no tests and reports success, so a scan that
  // silently found nothing would look exactly like a scan that found no
  // problems. These assertions are what stop this whole file going green
  // while checking nothing at all.
  it('actually reads the source tree', () => {
    expect(scannedFiles, `no source files found under ${SRC_ROOT}`).toBeGreaterThan(50);
  });

  it('finds the writes it is meant to be guarding', () => {
    expect(writes.length).toBeGreaterThan(8);
  });

  // If the scan ever stops reaching a key it used to reach, that is a hole
  // opening up, not a harmless change.
  it('reaches every key in the registry', () => {
    const unreachable = STORAGE_KEYS.filter((entry) => !written.has(entry.key)).map(
      (entry) => entry.key
    );

    expect(
      unreachable,
      'the scan can no longer see these being written, so it would not catch a sibling key going undisclosed'
    ).toEqual([]);
  });

  // A key assembled at runtime cannot be checked, so it cannot be allowed
  // through. Make it a module constant and the scan will resolve it.
  it('resolves every key that gets written', () => {
    const unresolved = writes
      .filter((write) => write.resolved.length === 0 && !isGenericAdapter(write))
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

describe('scoped keys are disclosed as scoped', () => {
  // `dashboard_sidebar_state` is really written as `dashboard_sidebar_state:`
  // plus a scope. The registry flag is what makes the privacy policy render it
  // as a prefix rather than claiming an exact name it never uses. Nothing
  // connected the two, so they could drift silently in either direction.
  it('flags every key the code appends a scope to', () => {
    const missingFlag = [...dynamic].filter(
      (key) => !STORAGE_KEYS.find((entry) => entry.key === key)?.hasDynamicSuffix
    );

    expect(
      missingFlag,
      'these get a runtime scope appended, so they need hasDynamicSuffix in the registry'
    ).toEqual([]);
  });

  it('does not flag keys that are written exactly as registered', () => {
    const overFlagged = STORAGE_KEYS.filter(
      (entry) => entry.hasDynamicSuffix && written.has(entry.key) && !dynamic.has(entry.key)
    ).map((entry) => entry.key);

    expect(
      overFlagged,
      'these are written verbatim, so the policy should show the exact name'
    ).toEqual([]);
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
