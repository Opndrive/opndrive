/**
 * Upload planning store.
 *
 * The store's job is to decide where every dropped folder lands, before a byte
 * moves. Three mechanics carry all the risk, and each is tested against the
 * failure it exists to prevent rather than against its happy path:
 *
 *  - Reservation is SYNCHRONOUS. The bug it replaces checked the bucket only,
 *    so two folders named "photos" in one drop both passed (neither is stored
 *    yet) and the second overwrote the first. Several tests here assert the
 *    absence of an await, not just the resulting names.
 *  - Claims are TASK-SCOPED and released on cancel, so a cancelled upload gives
 *    its name back instead of pushing the next drop to "photos (3)".
 *  - Verification is CONCURRENT, so the resolved names must not depend on which
 *    HTTP response arrives first. The concurrent tests run the same scenario
 *    under reversed response ordering and demand the same outcome.
 *  - A check ERROR is not a collision. A dead network costs one failed check
 *    per folder, an honest 'unverified' notice, and an unchanged name - never
 *    a suffix bump or a fabricated "was already here". Aborting mid-plan
 *    rejects promptly and gives every reserved claim back.
 *
 * `folderExists` is mocked at the module boundary: it is the store's only
 * network edge, and mocking it there leaves every line of the planning logic
 * real.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import {
  useUploadQueueStore,
  summariseSkipped,
  raceWithAbort,
  VERIFY_CONCURRENCY,
  SKIPPED_GROUP_THRESHOLD,
  MAX_NOTICES,
} from './use-upload-queue-store';
import type {
  FolderStructure,
  ProcessedDragData,
  SkippedEntry,
} from '../types/folder-upload-types';
import { folderExists } from '@/services/folder-existence';

vi.mock('@/services/folder-existence', () => ({
  folderExists: vi.fn(),
  describeFolderCheckError: vi.fn((action: string) => `could not check, ${action} cancelled`),
}));

const mockFolderExists = vi.mocked(folderExists);

const store = () => useUploadQueueStore.getState();

/** Stands in for the S3 provider; the store only ever hands it to `folderExists`. */
const apiS3 = { __brand: 'fake-s3' } as unknown as BYOS3ApiProvider;

function makeFile(name: string, size = 10): File {
  return new File([new Uint8Array(size)], name);
}

function makeFolder(name: string, fileCount = 2, fileSize = 10): FolderStructure {
  const files = Array.from({ length: fileCount }, (_, i) => makeFile(`${name}-${i}.txt`, fileSize));
  return {
    name,
    files,
    totalSize: fileCount * fileSize,
    relativePath: name,
  };
}

function dropOf(
  folders: FolderStructure[],
  extras: Partial<ProcessedDragData> = {}
): ProcessedDragData {
  return {
    individualFiles: [],
    folderStructures: folders,
    skipped: [],
    ...extras,
  };
}

/** Advances `n` microtasks, which is how response ordering is staged below. */
async function ticks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

/**
 * Makes `folderExists` answer from a fixed set of bucket prefixes.
 *
 * `delays` staggers individual responses so a test can decide which check wins
 * the race, without real timers.
 */
function bucketContains(prefixes: string[], delays: Record<string, number> = {}) {
  const existing = new Set(prefixes);
  mockFolderExists.mockImplementation(async (_api, prefix: string) => {
    await ticks(delays[prefix] ?? 0);
    return existing.has(prefix);
  });
  return existing;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Task ids are generated inside the store, so they are read back off the plan. */
const idsOf = (planned: { id: string }[]) => planned.map((p) => p.id);

beforeEach(() => {
  mockFolderExists.mockReset();
  // Default: an empty bucket, so tests that care only about local reservation
  // do not have to stage responses.
  mockFolderExists.mockResolvedValue(false);
});

describe('reservePrefix', () => {
  it('hands out a bare name when nothing is claimed', () => {
    const result = store().reservePrefix('photos', '', 'task-1');

    expect(result).toEqual({ resolvedName: 'photos', prefix: 'photos/', attempt: 0 });
  });

  it('suffixes sequentially within a single tick', () => {
    // The core of the fix. No awaits between these calls, so nothing external
    // could have updated the bucket; the store alone has to keep them apart.
    const a = store().reservePrefix('photos', '', 'task-1');
    const b = store().reservePrefix('photos', '', 'task-2');
    const c = store().reservePrefix('photos', '', 'task-3');

    expect([a.resolvedName, b.resolvedName, c.resolvedName]).toEqual([
      'photos',
      'photos (1)',
      'photos (2)',
    ]);
  });

  it('nests under the destination prefix', () => {
    const result = store().reservePrefix('photos', 'trips/2024', 'task-1');

    expect(result.prefix).toBe('trips/2024/photos/');
  });

  it.each([
    ['', 'photos/'],
    ['/', 'photos/'],
    ['docs', 'docs/photos/'],
    ['docs/', 'docs/photos/'],
    ['/docs', 'docs/photos/'],
  ])('normalises destination %j to %j', (destination, expected) => {
    expect(store().reservePrefix('photos', destination, 'task-1').prefix).toBe(expected);
  });

  it('survives a null destination from an untyped caller', () => {
    // The signature says string, but the destination originates in React
    // context that can hold null before a bucket is selected. The guard exists
    // for that window; without it this throws on .startsWith.
    const result = store().reservePrefix('photos', null as unknown as string, 'task-1');

    expect(result.prefix).toBe('photos/');
  });

  it('strips an existing counter instead of stacking one', () => {
    // Re-dropping a folder the user already renamed must not yield
    // "photos (1) (1)".
    store().reservePrefix('photos', '', 'task-1');

    const result = store().reservePrefix('photos (1)', '', 'task-2');

    expect(result.resolvedName).toBe('photos (1)');
  });

  it('starts searching from startAttempt when told to', () => {
    const result = store().reservePrefix('photos', '', 'task-1', 3);

    expect(result).toEqual({ resolvedName: 'photos (3)', prefix: 'photos (3)/', attempt: 3 });
  });

  it('records the claim against its task', () => {
    store().reservePrefix('photos', '', 'task-1');

    expect(store().claims).toEqual([{ prefix: 'photos/', taskId: 'task-1', committed: false }]);
  });

  it('falls back to a timestamp once attempts are exhausted', () => {
    // 101 claims covers attempts 0..100 inclusive, so the next call finds every
    // suffix taken. It must still terminate with something unique rather than
    // loop or overwrite.
    for (let i = 0; i <= 100; i++) store().reservePrefix('photos', '', `task-${i}`);

    const result = store().reservePrefix('photos', '', 'task-overflow');

    expect(result.attempt).toBe(101);
    expect(result.resolvedName).toMatch(/^photos \(\d{10,}\)$/);
    expect(store().claimedPrefixes()).toContain(result.prefix);
  });
});

describe('claim lifecycle', () => {
  it('reclaims a released middle slot rather than climbing past it', async () => {
    // The scenario the whole claim design exists for: drop three "photos",
    // cancel the middle one, drop "photos" again. The user sees a free
    // "photos (1)" and would not accept "photos (3)".
    const first = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
    });
    const second = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
    });
    const third = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
    });

    expect([
      first.planned[0]!.resolvedName,
      second.planned[0]!.resolvedName,
      third.planned[0]!.resolvedName,
    ]).toEqual(['photos', 'photos (1)', 'photos (2)']);

    store().releaseClaim(second.planned[0]!.id);
    expect(store().claimedPrefixes()).toEqual(['photos/', 'photos (2)/']);

    const fourth = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
    });

    expect(fourth.planned[0]!.resolvedName).toBe('photos (1)');
    expect(fourth.planned[0]!.prefix).toBe('photos (1)/');
  });

  it('keeps a committed claim through releaseClaim', async () => {
    // Bytes have landed. Releasing would let a later drop pick the same prefix
    // and overwrite them, which is the one outcome worse than a stray suffix.
    const { planned } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
    });
    const taskId = planned[0]!.id;

    store().commitClaim(taskId);
    store().releaseClaim(taskId);

    expect(store().claimedPrefixes()).toEqual(['photos/']);
    expect(store().claims[0]).toMatchObject({ taskId, committed: true });
  });

  it('pushes a later drop past a committed prefix', async () => {
    const { planned } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
    });
    store().commitClaim(planned[0]!.id);
    store().releaseClaim(planned[0]!.id);

    const next = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
    });

    expect(next.planned[0]!.resolvedName).toBe('photos (1)');
  });

  it('releases every claim a task owns', () => {
    store().reservePrefix('photos', '', 'task-1');
    store().reservePrefix('videos', '', 'task-1');
    store().reservePrefix('docs', '', 'task-2');

    store().releaseClaim('task-1');

    expect(store().claimedPrefixes()).toEqual(['docs/']);
  });

  it('releases only the uncommitted claims of a partly committed task', () => {
    // A task can hold more than one claim after a bump; commit marks the whole
    // task, so this pins that a stale claim left behind by a bump is still
    // recoverable when commit has not run.
    store().reservePrefix('photos', '', 'task-1');
    store().reservePrefix('videos', '', 'task-1');
    store().commitClaim('task-1');
    store().reservePrefix('docs', '', 'task-1');

    store().releaseClaim('task-1');

    expect(store().claimedPrefixes()).toEqual(['photos/', 'videos/']);
  });

  it('ignores commitClaim for an unknown task', () => {
    store().reservePrefix('photos', '', 'task-1');

    store().commitClaim('task-does-not-exist');

    expect(store().claims).toEqual([{ prefix: 'photos/', taskId: 'task-1', committed: false }]);
  });

  it('ignores releaseClaim for an unknown task', () => {
    store().reservePrefix('photos', '', 'task-1');

    store().releaseClaim('task-does-not-exist');

    expect(store().claimedPrefixes()).toEqual(['photos/']);
  });

  describe('releasePrefix', () => {
    it('frees a single uncommitted prefix', () => {
      store().reservePrefix('photos', '', 'task-1');
      store().reservePrefix('videos', '', 'task-1');

      store().releasePrefix('photos/');

      expect(store().claimedPrefixes()).toEqual(['videos/']);
    });

    it('normalises the prefix it is given', () => {
      store().reservePrefix('photos', '', 'task-1');

      store().releasePrefix('photos');

      expect(store().claimedPrefixes()).toEqual([]);
    });

    it('will not free a committed prefix', () => {
      store().reservePrefix('photos', '', 'task-1');
      store().commitClaim('task-1');

      store().releasePrefix('photos/');

      expect(store().claimedPrefixes()).toEqual(['photos/']);
    });
  });
});

describe('planDrop: local reservation phase', () => {
  it('reserves every folder before the first await', async () => {
    // The architectural guarantee, asserted directly: phase A must contain no
    // awaits, so all three names exist by the time planDrop() returns its
    // promise. If a check ever moved above the reservation loop, this fails.
    const gate = deferred<boolean>();
    mockFolderExists.mockReturnValue(gate.promise);

    const pending = store().planDrop(
      dropOf([makeFolder('photos'), makeFolder('photos'), makeFolder('photos')]),
      { destinationPrefix: '', apiS3 }
    );

    expect(store().claimedPrefixes()).toEqual(['photos/', 'photos (1)/', 'photos (2)/']);

    gate.resolve(false);
    await pending;
  });

  it('separates same-named folders in one drop', async () => {
    // The original bug: both were checked against the bucket, neither was
    // stored yet, so both passed and the second overwrote the first.
    const { planned } = await store().planDrop(
      dropOf([makeFolder('photos'), makeFolder('photos')]),
      { destinationPrefix: '', apiS3 }
    );

    expect(planned.map((p) => p.prefix)).toEqual(['photos/', 'photos (1)/']);
    expect(new Set(planned.map((p) => p.prefix)).size).toBe(2);
  });

  it('plans loose files as one batch at the destination', async () => {
    const files = [makeFile('a.txt', 5), makeFile('b.txt', 7)];

    const { planned } = await store().planDrop(dropOf([], { individualFiles: files }), {
      destinationPrefix: 'docs',
    });

    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({
      kind: 'file',
      prefix: 'docs/',
      totalBytes: 12,
    });
    expect(planned[0]!.files).toHaveLength(2);
  });

  it('omits the file batch when nothing loose was dropped', async () => {
    const { planned } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
    });

    expect(planned.every((p) => p.kind === 'folder')).toBe(true);
  });

  it('sums folder bytes from the files themselves', async () => {
    const { planned } = await store().planDrop(dropOf([makeFolder('photos', 3, 100)]), {
      destinationPrefix: '',
    });

    expect(planned[0]!.totalBytes).toBe(300);
    expect(planned[0]!.files).toHaveLength(3);
  });

  it('copies the file list rather than aliasing the drop payload', async () => {
    // The plan outlives the drop event; sharing the array would let a later
    // mutation of the payload change what gets uploaded.
    const folder = makeFolder('photos', 1);

    const { planned } = await store().planDrop(dropOf([folder]), { destinationPrefix: '' });
    folder.files.push(makeFile('sneaked-in.txt'));

    expect(planned[0]!.files).toHaveLength(1);
  });

  it('skips bucket checks entirely when no api is given', async () => {
    const { planned } = await store().planDrop(
      dropOf([makeFolder('photos')], { individualFiles: [makeFile('a.txt')] }),
      { destinationPrefix: '' }
    );

    expect(mockFolderExists).not.toHaveBeenCalled();
    // 'unchecked', not 'confirmed': nothing was verified, and the plan says so.
    expect(planned.map((p) => p.verification)).toEqual(['unchecked', 'unchecked']);
  });

  it('marks the loose-file batch unchecked even when folders are verified', async () => {
    const { planned } = await store().planDrop(
      dropOf([makeFolder('photos')], { individualFiles: [makeFile('a.txt')] }),
      { destinationPrefix: '', apiS3 }
    );

    // Folder verification does not speak for object-level file collisions;
    // those belong to the per-file duplicate prompt.
    expect(planned.find((p) => p.kind === 'file')!.verification).toBe('unchecked');
    expect(planned.find((p) => p.kind === 'folder')!.verification).toBe('confirmed');
  });

  it('plans an empty drop without touching state', async () => {
    const result = await store().planDrop(dropOf([]), { destinationPrefix: '', apiS3 });

    expect(result).toEqual({ planned: [], notices: [] });
    expect(store().claims).toEqual([]);
  });

  it('flags isPlanning while in flight and clears it after', async () => {
    const gate = deferred<boolean>();
    mockFolderExists.mockReturnValue(gate.promise);

    const pending = store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
    });
    expect(store().isPlanning).toBe(true);

    gate.resolve(false);
    await pending;

    expect(store().isPlanning).toBe(false);
  });
});

describe('planDrop: bucket verification phase', () => {
  it('bumps past a prefix that already exists in the bucket', async () => {
    bucketContains(['photos/']);

    const { planned } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
    });

    expect(planned[0]!.resolvedName).toBe('photos (1)');
    expect(planned[0]!.verification).toBe('confirmed');
    expect(store().claimedPrefixes()).toEqual(['photos (1)/']);
  });

  it('keeps bumping through a run of existing prefixes', async () => {
    bucketContains(['photos/', 'photos (1)/', 'photos (2)/']);

    const { planned } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
    });

    expect(planned[0]!.resolvedName).toBe('photos (3)');
  });

  it('checks against the destination prefix, not the bucket root', async () => {
    bucketContains(['trips/photos/']);

    const { planned } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: 'trips',
      apiS3,
    });

    expect(mockFolderExists).toHaveBeenCalledWith(apiS3, 'trips/photos/');
    expect(planned[0]!.prefix).toBe('trips/photos (1)/');
  });

  it('halts on a failed check and keeps the locally reserved name', async () => {
    // An error is not a collision. The first version of this store conflated
    // them, so a dead network bumped through the full suffix space and shipped
    // a "renamed" notice for a conflict that never existed.
    mockFolderExists.mockRejectedValue(new Error('NetworkError: Failed to fetch'));

    const { planned, notices } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
    });

    // The name the synchronous pass reserved, untouched.
    expect(planned[0]!.resolvedName).toBe('photos');
    expect(planned[0]!.verification).toBe('failed');
    // ONE check, not a hundred and one: the suffix loop must not retry into a
    // dead network.
    expect(mockFolderExists).toHaveBeenCalledTimes(1);
    // The claim survives - the name is still reserved for this session.
    expect(store().claimedPrefixes()).toEqual(['photos/']);
    // And the user is told the truth: unverified, never "renamed".
    expect(notices.map((n) => n.kind)).toEqual(['unverified']);
    expect(notices[0]!.detail).toContain('Could not check whether "photos" already exists');
  });

  it('keeps a genuinely bumped name when a later check fails', async () => {
    // The first answer is a real collision; the network dies checking the
    // bumped name. The bump that happened was real and stays. The failure
    // stops the loop where it is.
    mockFolderExists.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('timeout'));

    const { planned, notices } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
    });

    expect(planned[0]!.resolvedName).toBe('photos (1)');
    expect(planned[0]!.verification).toBe('failed');
    expect(notices.map((n) => n.kind)).toEqual(['renamed', 'unverified']);
  });

  it('costs one check per folder when the whole network is down', async () => {
    // The audit's arithmetic: 20 folders against a dead network used to fire
    // 100+ checks EACH. Now the bill is one failed check per folder, every
    // folder keeps its own name, and every plan says so.
    mockFolderExists.mockRejectedValue(new Error('ERR_INTERNET_DISCONNECTED'));

    const { planned } = await store().planDrop(
      dropOf(Array.from({ length: 20 }, (_, i) => makeFolder(`folder-${i}`))),
      { destinationPrefix: '', apiS3 }
    );

    expect(mockFolderExists).toHaveBeenCalledTimes(20);
    expect(planned.every((p) => p.verification === 'failed')).toBe(true);
    expect(planned.every((p) => p.resolvedName === p.originalName)).toBe(true);
  });

  it('plans every folder even when an earlier one has trouble', async () => {
    // The old loop returned on the first duplicate and silently abandoned the
    // rest of the drop. A check failure on `a` must not poison `b` or `c` -
    // and must not rename `a` either.
    mockFolderExists.mockImplementation(async (_api, prefix: string) => {
      if (prefix === 'a/') throw new Error('throttled');
      return prefix === 'b/';
    });

    const { planned } = await store().planDrop(
      dropOf([makeFolder('a'), makeFolder('b'), makeFolder('c')]),
      { destinationPrefix: '', apiS3 }
    );

    expect(planned.map((p) => p.originalName)).toEqual(['a', 'b', 'c']);
    expect(planned.map((p) => p.resolvedName)).toEqual(['a', 'b (1)', 'c']);
    expect(planned.map((p) => p.verification)).toEqual(['failed', 'confirmed', 'confirmed']);
  });

  it('gives up after the guard limit instead of spinning forever', async () => {
    // A bucket (or a broken endpoint) that says "taken" to everything must not
    // hang the drop.
    mockFolderExists.mockResolvedValue(true);

    const { planned } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
    });

    // Exactly one check per attempt up to the guard, then it stops: 101 calls,
    // not an unbounded retry storm. It still yields a usable name, and leaves
    // no stale claim from the attempts it abandoned.
    expect(mockFolderExists).toHaveBeenCalledTimes(101);
    expect(planned).toHaveLength(1);
    expect(planned[0]!.resolvedName).toMatch(/^photos \(\d{10,}\)$/);
    expect(store().claims).toHaveLength(1);
    // Not 'failed': the bucket was answering the whole time; the timestamp
    // fallback is the designed terminal state, not a network problem.
    expect(planned[0]!.verification).toBe('confirmed');
  });

  it('leaves no stale claim behind after a bump', async () => {
    bucketContains(['photos/', 'photos (1)/']);

    await store().planDrop(dropOf([makeFolder('photos')]), { destinationPrefix: '', apiS3 });

    expect(store().claimedPrefixes()).toEqual(['photos (2)/']);
  });
});

describe('planDrop: concurrent verification', () => {
  it.each([
    ['first check answers first', { 'photos/': 0, 'photos (1)/': 6 }],
    ['second check answers first', { 'photos/': 6, 'photos (1)/': 0 }],
  ])('resolves to distinct sequential names when the %s', async (_label, delays) => {
    // The synchronous reservation is what makes this deterministic: both drops
    // are mid-flight against a bucket that already holds photos/ and
    // photos (1)/, and the outcome must not depend on which HTTP response wins.
    bucketContains(['photos/', 'photos (1)/'], delays);

    const [first, second] = await Promise.all([
      store().planDrop(dropOf([makeFolder('photos')]), { destinationPrefix: '', apiS3 }),
      store().planDrop(dropOf([makeFolder('photos')]), { destinationPrefix: '', apiS3 }),
    ]);

    const names = [first.planned[0]!.resolvedName, second.planned[0]!.resolvedName];

    expect(new Set(names).size).toBe(2);
    expect([...names].sort()).toEqual(['photos (2)', 'photos (3)']);
    expect([...store().claimedPrefixes()].sort()).toEqual(['photos (2)/', 'photos (3)/']);
  });

  it('never assigns one prefix to two folders under staggered responses', async () => {
    // Six identical folders, each check answering after a different number of
    // microtasks, so the completion order is thoroughly shuffled relative to
    // the reservation order.
    let call = 0;
    mockFolderExists.mockImplementation(async (_api, prefix: string) => {
      await ticks((call++ * 3) % 7);
      return prefix === 'photos/';
    });

    const { planned } = await store().planDrop(
      dropOf(Array.from({ length: 6 }, () => makeFolder('photos'))),
      { destinationPrefix: '', apiS3 }
    );

    const prefixes = planned.map((p) => p.prefix);
    expect(new Set(prefixes).size).toBe(6);
    expect(prefixes).not.toContain('photos/');
  });

  it('holds in-flight checks to VERIFY_CONCURRENCY', async () => {
    let inFlight = 0;
    let peak = 0;
    mockFolderExists.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await ticks(3);
      inFlight--;
      return false;
    });

    await store().planDrop(
      dropOf(Array.from({ length: 20 }, (_, i) => makeFolder(`folder-${i}`))),
      { destinationPrefix: '', apiS3 }
    );

    expect(peak).toBe(VERIFY_CONCURRENCY);
    expect(mockFolderExists).toHaveBeenCalledTimes(20);
  });

  it('runs in parallel rather than one round-trip per folder', async () => {
    // Negative control for the above: if verification were sequential, peak
    // would be 1 and this assertion would be the one that catches it.
    let inFlight = 0;
    let peak = 0;
    mockFolderExists.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await ticks(2);
      inFlight--;
      return false;
    });

    await store().planDrop(dropOf(Array.from({ length: 3 }, (_, i) => makeFolder(`folder-${i}`))), {
      destinationPrefix: '',
      apiS3,
    });

    expect(peak).toBe(3);
  });
});

describe('planDrop: abort', () => {
  it('rejects up front on a signal that is already dead', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      store().planDrop(dropOf([makeFolder('photos')]), {
        destinationPrefix: '',
        apiS3,
        signal: controller.signal,
      })
    ).rejects.toHaveProperty('name', 'AbortError');

    // Nothing was touched: no wire traffic, no claims, no planning flag.
    expect(mockFolderExists).not.toHaveBeenCalled();
    expect(store().claims).toEqual([]);
    expect(store().isPlanning).toBe(false);
  });

  it('returns promptly even when the in-flight check never settles', async () => {
    // The audit's pinned-UI scenario: without the race, an aborted plan waits
    // however long the SDK takes to give up - here forever, so this test
    // TIMES OUT if the race is ever removed.
    mockFolderExists.mockReturnValue(new Promise<boolean>(() => {}));
    const controller = new AbortController();

    const pending = store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
      signal: controller.signal,
    });
    expect(store().isPlanning).toBe(true);

    controller.abort();

    await expect(pending).rejects.toHaveProperty('name', 'AbortError');
    expect(store().isPlanning).toBe(false);
  });

  it('gives back every claim the cancelled plan reserved', async () => {
    mockFolderExists.mockReturnValue(new Promise<boolean>(() => {}));
    const controller = new AbortController();

    const pending = store().planDrop(
      dropOf([makeFolder('photos'), makeFolder('videos'), makeFolder('docs')]),
      { destinationPrefix: '', apiS3, signal: controller.signal }
    );
    // Phase A has already reserved all three - that is the synchronous
    // guarantee - so there is something real to give back.
    expect(store().claimedPrefixes()).toEqual(['photos/', 'videos/', 'docs/']);

    controller.abort();
    await expect(pending).rejects.toHaveProperty('name', 'AbortError');

    expect(store().claims).toEqual([]);
  });

  it('rejects even when the abort races a collision answer', async () => {
    // The abort and a "taken" answer arrive in the same tick. Whichever way
    // that race lands internally, the observable contract is the same: the
    // plan rejects, no bump is kept, and every claim comes back.
    const first = deferred<boolean>();
    mockFolderExists
      .mockReturnValueOnce(first.promise)
      .mockRejectedValue(new Error('network died with the abort'));
    const controller = new AbortController();

    const pending = store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
      signal: controller.signal,
    });

    controller.abort();
    first.resolve(true);

    await expect(pending).rejects.toHaveProperty('name', 'AbortError');
    expect(store().claims).toEqual([]);
  });

  it('leaves claims from other work alone when aborting', async () => {
    store().reservePrefix('keep-me', '', 'other-task');
    mockFolderExists.mockReturnValue(new Promise<boolean>(() => {}));
    const controller = new AbortController();

    const pending = store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toHaveProperty('name', 'AbortError');

    // Only the cancelled drop's claims are released, not the whole session's.
    expect(store().claimedPrefixes()).toEqual(['keep-me/']);
  });

  it('plans normally when the signal never fires', async () => {
    const controller = new AbortController();

    const { planned } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
      signal: controller.signal,
    });

    expect(planned[0]!.verification).toBe('confirmed');
    expect(store().claimedPrefixes()).toEqual(['photos/']);
  });

  it('still reports an honest failure when a signal is attached but never fired', async () => {
    // A check error with a live signal must take the error path, not the
    // abort path: verification 'failed', claims intact, no rejection.
    mockFolderExists.mockRejectedValue(new Error('boom'));
    const controller = new AbortController();

    const { planned } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
      signal: controller.signal,
    });

    expect(planned[0]!.verification).toBe('failed');
    expect(store().claimedPrefixes()).toEqual(['photos/']);
  });

  describe('raceWithAbort', () => {
    // planDrop cannot reach the pre-aborted branch (an abort always lands on
    // a live listener there), but the helper's own contract must hold for any
    // future caller: a dead signal rejects immediately, never hangs.
    it('rejects immediately on an already-aborted signal instead of hanging', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        raceWithAbort(new Promise<never>(() => {}), controller.signal)
      ).rejects.toHaveProperty('name', 'AbortError');
    });

    it('absorbs the doomed promise rejection so nothing leaks unhandled', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        raceWithAbort(Promise.reject(new Error('late failure')), controller.signal)
      ).rejects.toHaveProperty('name', 'AbortError');

      // Drain microtasks: if the discarded rejection were left unhandled,
      // vitest would fail this file with an unhandled-rejection error.
      await ticks(2);
    });
  });
});

describe('case sensitivity', () => {
  it('treats Photos and photos as independent folders', async () => {
    // S3 keys are case-sensitive, so these are genuinely different objects.
    // Folding case would rename a folder the bucket has no conflict with.
    const { planned, notices } = await store().planDrop(
      dropOf([makeFolder('Photos'), makeFolder('photos')]),
      { destinationPrefix: '', apiS3 }
    );

    expect(planned.map((p) => p.resolvedName)).toEqual(['Photos', 'photos']);
    expect(planned.map((p) => p.prefix)).toEqual(['Photos/', 'photos/']);
    expect(notices).toEqual([]);
  });

  it('bumps only the casing that actually exists in the bucket', async () => {
    bucketContains(['photos/']);

    const { planned } = await store().planDrop(
      dropOf([makeFolder('Photos'), makeFolder('photos')]),
      { destinationPrefix: '', apiS3 }
    );

    expect(planned.map((p) => p.resolvedName)).toEqual(['Photos', 'photos (1)']);
  });

  it('keeps case distinct in the destination prefix too', async () => {
    const a = store().reservePrefix('photos', 'Trips', 'task-1');
    const b = store().reservePrefix('photos', 'trips', 'task-2');

    expect([a.prefix, b.prefix]).toEqual(['Trips/photos/', 'trips/photos/']);
  });
});

describe('summariseSkipped', () => {
  function flood(
    count: number,
    folder: string,
    reason: string,
    kind: SkippedEntry['kind'] = 'file'
  ) {
    return Array.from({ length: count }, (_, i) => ({
      path: `${folder}f${i}.js`,
      reason,
      kind,
    }));
  }

  it('collapses a flood into one notice that keeps the true count', () => {
    // Dropping a project directory produces thousands of these. Pushing each
    // into state bloats it and buries the notices that matter.
    const notices = summariseSkipped(
      flood(500, 'proj/node_modules/', 'could not be read (EACCES)')
    );

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      kind: 'skipped',
      path: 'proj/node_modules/',
      count: 500,
    });
    expect(notices[0]!.detail).toBe(
      'proj/node_modules/f0.js and 499 other item(s) in this folder could not be read (EACCES) and were not uploaded.'
    );
  });

  it('splits a second reason in the same folder into its own group', () => {
    // A permission error and a missing file are two different facts, even in
    // one directory, so they must not be merged into a single count.
    const notices = summariseSkipped([
      ...flood(30, 'proj/node_modules/', 'could not be read (EACCES)'),
      ...flood(25, 'proj/node_modules/', 'disappeared during the upload'),
    ]);

    expect(notices).toHaveLength(2);
    expect(notices.map((n) => n.count)).toEqual([30, 25]);
    expect(notices[0]!.detail).toContain('could not be read (EACCES)');
    expect(notices[1]!.detail).toContain('disappeared during the upload');
  });

  it('splits the same reason across different folders', () => {
    const notices = summariseSkipped([
      ...flood(25, 'proj/node_modules/', 'could not be read (EACCES)'),
      ...flood(25, 'proj/.git/', 'could not be read (EACCES)'),
    ]);

    expect(notices.map((n) => n.path)).toEqual(['proj/node_modules/', 'proj/.git/']);
  });

  it('lists entries individually at the threshold', () => {
    const notices = summariseSkipped(
      flood(SKIPPED_GROUP_THRESHOLD, 'proj/node_modules/', 'could not be read (EACCES)')
    );

    expect(notices).toHaveLength(SKIPPED_GROUP_THRESHOLD);
    expect(notices.every((n) => n.count === 1)).toBe(true);
  });

  it('aggregates one past the threshold', () => {
    const notices = summariseSkipped(
      flood(SKIPPED_GROUP_THRESHOLD + 1, 'proj/node_modules/', 'could not be read (EACCES)')
    );

    expect(notices).toHaveLength(1);
    expect(notices[0]!.count).toBe(SKIPPED_GROUP_THRESHOLD + 1);
  });

  it('honours a caller-supplied threshold', () => {
    const notices = summariseSkipped(flood(5, 'proj/', 'could not be read (EACCES)'), 3);

    expect(notices).toHaveLength(1);
    expect(notices[0]!.count).toBe(5);
  });

  it('groups correctly when the folder name contains spaces', () => {
    // The group key joins folder and reason, so a naive separator would split
    // "my holiday photos/" at the wrong place.
    const notices = summariseSkipped(
      flood(50, 'my holiday photos/raw files/', 'could not be read (EACCES)')
    );

    expect(notices).toHaveLength(1);
    expect(notices[0]!.path).toBe('my holiday photos/raw files/');
  });

  it('describes a single skipped file in full', () => {
    const notices = summariseSkipped([
      { path: 'photos/locked.cr2', reason: 'could not be read', kind: 'file' },
    ]);

    expect(notices[0]).toMatchObject({ path: 'photos/locked.cr2', count: 1 });
    expect(notices[0]!.detail).toBe(
      'File "photos/locked.cr2" could not be read and was not uploaded.'
    );
  });

  it('says Folder for a skipped directory', () => {
    const notices = summariseSkipped([
      { path: 'photos/raw', reason: 'could not be opened', kind: 'folder' },
    ]);

    expect(notices[0]!.detail).toBe(
      'Folder "photos/raw" could not be opened and was not uploaded.'
    );
  });

  it('falls back to the entry path for root-level entries', () => {
    const notices = summariseSkipped(
      Array.from({ length: 30 }, (_, i) => ({
        path: `loose-${i}.txt`,
        reason: 'could not be read',
        kind: 'file' as const,
      }))
    );

    expect(notices).toHaveLength(1);
    expect(notices[0]!.path).toBe('loose-0.txt');
  });

  it('returns nothing for an empty list', () => {
    expect(summariseSkipped([])).toEqual([]);
  });

  describe('flood bounding', () => {
    it('caps a wide flood that never trips the group threshold', () => {
      // The shape per-group aggregation cannot catch: 19 failures in each of
      // 500 folders is under the threshold every single time, and used to put
      // 9,500 notices into state.
      const wide = Array.from({ length: 500 }, (_, folder) =>
        Array.from({ length: 19 }, (_, file) => ({
          path: `proj/pkg-${folder}/f${file}.js`,
          reason: 'could not be read (EACCES)',
          kind: 'file' as const,
        }))
      ).flat();

      const notices = summariseSkipped(wide);

      expect(notices).toHaveLength(MAX_NOTICES);
      // Nothing is silently lost: the overflow notice accounts for every
      // entry the truncated notices stood for.
      const total = notices.reduce((sum, n) => sum + n.count, 0);
      expect(total).toBe(9500);
    });

    it('describes the overflow in terms of items, not notices', () => {
      const wide = Array.from({ length: 300 }, (_, folder) => ({
        path: `proj/pkg-${folder}/f.js`,
        reason: 'could not be read',
        kind: 'file' as const,
      }));

      const overflow = summariseSkipped(wide).at(-1)!;

      expect(overflow.count).toBe(201);
      expect(overflow.detail).toBe(
        '201 further item(s) across 201 other location(s) could not be uploaded.'
      );
    });

    it('leaves a list that fits the cap completely alone', () => {
      const modest = Array.from({ length: MAX_NOTICES }, (_, i) => ({
        path: `proj/pkg-${i}/f.js`,
        reason: 'could not be read',
        kind: 'file' as const,
      }));

      const notices = summariseSkipped(modest);

      expect(notices).toHaveLength(MAX_NOTICES);
      expect(notices.every((n) => n.count === 1)).toBe(true);
    });

    it('counts aggregated groups correctly in the overflow total', () => {
      // Mixes deep and wide: each folder trips the group threshold, so every
      // notice already stands for 25 entries before the cap applies.
      const deepAndWide = Array.from({ length: 200 }, (_, folder) =>
        Array.from({ length: 25 }, (_, file) => ({
          path: `proj/pkg-${folder}/f${file}.js`,
          reason: 'could not be read (EACCES)',
          kind: 'file' as const,
        }))
      ).flat();

      const notices = summariseSkipped(deepAndWide);

      expect(notices).toHaveLength(MAX_NOTICES);
      expect(notices.reduce((sum, n) => sum + n.count, 0)).toBe(5000);
    });
  });

  it('gives every notice a distinct id', () => {
    const notices = summariseSkipped(flood(10, 'proj/', 'could not be read'));

    expect(new Set(notices.map((n) => n.id)).size).toBe(10);
  });
});

describe('notices', () => {
  it('carries extraction losses through a drop', async () => {
    const skipped: SkippedEntry[] = [
      { path: 'photos/locked.cr2', reason: 'could not be read', kind: 'file' },
    ];

    const { notices } = await store().planDrop(dropOf([makeFolder('photos')], { skipped }), {
      destinationPrefix: '',
    });

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: 'skipped', path: 'photos/locked.cr2' });
  });

  it('explains a rename in terms the user can act on', async () => {
    bucketContains(['photos/']);

    const { notices } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
    });

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: 'renamed', path: 'photos', count: 1 });
    expect(notices[0]!.detail).toBe(
      'A folder named "photos" was already here, so this one is being uploaded as "photos (1)".'
    );
  });

  it('raises no notice when nothing was renamed', async () => {
    const { notices } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
    });

    expect(notices).toEqual([]);
  });

  it('accumulates notices across drops', async () => {
    await store().planDrop(dropOf([makeFolder('photos')]), { destinationPrefix: '', apiS3 });
    await store().planDrop(dropOf([makeFolder('photos')]), { destinationPrefix: '', apiS3 });

    expect(store().notices).toHaveLength(1);
    expect(store().notices[0]!.kind).toBe('renamed');
  });

  it('returns the notices for this drop only', async () => {
    await store().planDrop(dropOf([makeFolder('photos')]), { destinationPrefix: '', apiS3 });

    const second = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
    });

    expect(second.notices).toHaveLength(1);
    expect(store().notices).toHaveLength(1);
  });

  it('dismisses one notice by id', async () => {
    const skipped: SkippedEntry[] = [
      { path: 'a/one.txt', reason: 'could not be read', kind: 'file' },
      { path: 'a/two.txt', reason: 'disappeared', kind: 'file' },
    ];
    await store().planDrop(dropOf([], { skipped }), { destinationPrefix: '' });

    store().dismissNotice(store().notices[0]!.id);

    expect(store().notices).toHaveLength(1);
    expect(store().notices[0]!.path).toBe('a/two.txt');
  });

  it('stays bounded across many drops', async () => {
    // Each drop is individually well behaved; the array still grows without a
    // session-level trim.
    for (let drop = 0; drop < 40; drop++) {
      await store().planDrop(
        dropOf([], {
          skipped: Array.from({ length: 5 }, (_, i) => ({
            path: `drop-${drop}/f${i}.txt`,
            reason: 'could not be read',
            kind: 'file' as const,
          })),
        }),
        { destinationPrefix: '' }
      );
    }

    expect(store().notices).toHaveLength(MAX_NOTICES);
    // The newest survive - an old notice matters less than a fresh one.
    expect(store().notices.at(-1)!.path).toBe('drop-39/f4.txt');
  });

  it('clears them all', async () => {
    const skipped: SkippedEntry[] = [
      { path: 'a/one.txt', reason: 'could not be read', kind: 'file' },
    ];
    await store().planDrop(dropOf([], { skipped }), { destinationPrefix: '' });

    store().clearNotices();

    expect(store().notices).toEqual([]);
  });
});

describe('reset', () => {
  it('drops claims and notices on logout', async () => {
    // Claims describe one bucket. Carrying them into the next session would
    // suffix names that are free there.
    bucketContains(['photos/']);
    const { planned } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
      apiS3,
    });
    store().commitClaim(planned[0]!.id);

    store().reset();

    expect(store().claims).toEqual([]);
    expect(store().notices).toEqual([]);
    expect(store().isPlanning).toBe(false);
  });

  it('frees names for the next session', async () => {
    await store().planDrop(dropOf([makeFolder('photos')]), { destinationPrefix: '' });
    store().reset();

    const { planned } = await store().planDrop(dropOf([makeFolder('photos')]), {
      destinationPrefix: '',
    });

    expect(planned[0]!.resolvedName).toBe('photos');
  });
});

describe('plan identity', () => {
  it('gives each planned item an id usable for commit and release', async () => {
    const { planned } = await store().planDrop(
      dropOf([makeFolder('a'), makeFolder('b')], { individualFiles: [makeFile('loose.txt')] }),
      { destinationPrefix: '' }
    );

    expect(new Set(idsOf(planned)).size).toBe(planned.length);

    const folderTask = planned.find((p) => p.originalName === 'a')!;
    store().releaseClaim(folderTask.id);

    expect(store().claimedPrefixes()).toEqual(['b/']);
  });
});
