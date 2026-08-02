'use client';

/**
 * Upload planning.
 *
 * This store does NOT run uploads. `@opndrive/s3-api`'s UploadManager already
 * owns the queue, the concurrency limit and multipart chunking, and it is well
 * covered - a second queue here would duplicate that and the two would compete
 * over the same concurrency budget.
 *
 * What was missing is everything that has to happen BEFORE a byte moves:
 *
 *   ProcessedDragData
 *         |
 *         v
 *   [ this store ]        destinations, collisions, notices
 *         |  PlannedUpload[]
 *         v
 *   s3-api UploadManager  queue, concurrency, multipart
 *         |
 *         v
 *   use-upload-store      per-item progress and UI state
 *
 * Problems it exists to solve, all found by audit rather than by design:
 *
 * 1. Collisions were checked against the BUCKET only, so two folders named
 *    "photos" in one drop both passed (neither is stored yet) and the second
 *    overwrote the first.
 * 2. The old folder loop did `return` on the first duplicate, abandoning every
 *    folder behind it in the same drop.
 * 3. Extraction losses had nowhere to go, so a folder could upload short and
 *    nothing downstream could say so.
 * 4. A failed bucket check was read as a collision, so a dead network renamed
 *    folders and reported conflicts that never existed.
 */

import { create } from 'zustand';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import type {
  FolderStructure,
  ProcessedDragData,
  SkippedEntry,
} from '../types/folder-upload-types';
import { folderExists } from '@/services/folder-existence';

/** Safety valve on the auto-suffix search, mirroring the rename service. */
const MAX_SUFFIX_ATTEMPTS = 100;

/**
 * How many bucket checks run at once during verification.
 *
 * Sequential checks would mean one HTTP round-trip per folder before the first
 * byte moves - twenty folders is twenty round-trips of dead time. The local
 * reservation pass has already made the drop internally consistent, so these
 * are free to run in parallel.
 */
export const VERIFY_CONCURRENCY = 5;

/**
 * Skipped entries sharing a folder and a reason collapse into one notice past
 * this many. Dropping a project directory can produce thousands of permission
 * errors from `node_modules`, and pushing each into state would bloat it and
 * bury the notices that matter.
 */
export const SKIPPED_GROUP_THRESHOLD = 20;

/**
 * Hard ceiling on how many notices exist at once.
 *
 * Per-group aggregation handles a DEEP flood (a thousand failures in one
 * node_modules), but not a WIDE one: nineteen failures in each of five hundred
 * folders stays under the group threshold every time and still lands 9,500
 * notices in state. Past this many, the tail collapses into a single overflow
 * notice - nobody reads notice 101, and the array is what the operations panel
 * maps over.
 */
export const MAX_NOTICES = 100;

/**
 * One unit of work, with its destination already decided.
 *
 * By the time a PlannedUpload exists, `prefix` is final: checked against the
 * bucket and against every other item in the same drop. The executor never has
 * to think about naming again.
 */
export interface PlannedUpload {
  id: string;
  kind: 'file' | 'folder';
  /** What the user dropped. */
  originalName: string;
  /** What it will actually be stored as, after collision resolution. */
  resolvedName: string;
  /** Full destination prefix, ending in '/' for folders. */
  prefix: string;
  /**
   * Whether `prefix` survived a bucket check.
   *
   * 'confirmed' - the bucket answered and the name is free (possibly after
   * bumps). 'failed' - the bucket never answered; the name is safe within this
   * session but the executor should know it was never checked remotely.
   * 'unchecked' - no check was asked for: planning ran without an api, or this
   * is a loose-file batch whose collisions the per-file duplicate prompt owns.
   */
  verification: 'confirmed' | 'failed' | 'unchecked';
  files: File[];
  totalBytes: number;
}

/**
 * Something worth telling the user about a drop, short of a failure.
 *
 * `skipped` comes from extraction; `renamed` and `unverified` are this store's
 * doing. All land in one list so the operations panel has a single thing to
 * render.
 */
export interface QueueNotice {
  id: string;
  kind: 'skipped' | 'renamed' | 'unverified';
  path: string;
  detail: string;
  /** How many underlying entries this notice stands for. >1 means aggregated. */
  count: number;
}

/**
 * A prefix this session has committed to.
 *
 * Claims are tied to the task that owns them so they can be given back. A
 * queued upload the user cancels before it starts must free its name, or a
 * later drop of the same folder is pushed to "photos (3)" for no reason the
 * user can see.
 */
export interface PrefixClaim {
  prefix: string;
  taskId: string;
  /**
   * Set once bytes have actually gone to S3. A committed claim is never
   * auto-released: freeing it would let a later drop pick the same prefix and
   * overwrite what already landed.
   */
  committed: boolean;
}

export interface PlanDropOptions {
  /** Destination the user dropped onto. '' or '/' means the bucket root. */
  destinationPrefix: string;
  /** Omit to skip bucket checks entirely (offline planning, or a known-fresh prefix). */
  apiS3?: BYOS3ApiProvider | null;
  /**
   * Aborts planning. Pending bucket checks are raced out (the answers are
   * discarded), every claim this drop reserved is given back, and `planDrop`
   * rejects with the signal's reason.
   */
  signal?: AbortSignal;
}

export interface PlanDropResult {
  planned: PlannedUpload[];
  notices: QueueNotice[];
}

/** planDrop's working record for one folder, mutated as verification bumps it. */
interface FolderReservation {
  folder: FolderStructure;
  taskId: string;
  resolvedName: string;
  prefix: string;
  attempt: number;
  verification: PlannedUpload['verification'];
}

interface UploadQueueState {
  /** True while a drop is being planned; the UI shows a "preparing" state. */
  isPlanning: boolean;
  claims: PrefixClaim[];
  notices: QueueNotice[];

  planDrop: (data: ProcessedDragData, options: PlanDropOptions) => Promise<PlanDropResult>;

  /**
   * Reserves a folder name synchronously and returns it.
   *
   * No awaits, which is the whole point: two callers in the same tick cannot
   * both be told a name is free. Bucket state is not consulted - that is
   * `planDrop`'s verification pass.
   */
  reservePrefix: (
    name: string,
    destination: string,
    taskId: string,
    startAttempt?: number
  ) => { resolvedName: string; prefix: string; attempt: number };

  /** Marks a task's claims as having landed bytes, so they are never released. */
  commitClaim: (taskId: string) => void;
  /** Gives back a cancelled task's uncommitted claims. */
  releaseClaim: (taskId: string) => void;
  /** Gives back a single uncommitted prefix. */
  releasePrefix: (prefix: string) => void;
  /** Every prefix currently spoken for, committed or not. */
  claimedPrefixes: () => string[];

  dismissNotice: (id: string) => void;
  clearNotices: () => void;
  /** Called on logout or bucket switch - claims from one session mean nothing in the next. */
  reset: () => void;
}

let seq = 0;
const nextId = (kind: string) => `${kind}-${Date.now()}-${seq++}`;

/** Normalises '' and '/' to '', and guarantees a single trailing slash otherwise. */
function normalisePrefix(prefix: string): string {
  let value = prefix ?? '';
  if (value.startsWith('/')) value = value.slice(1);
  if (!value || value === '/') return '';
  return value.endsWith('/') ? value : `${value}/`;
}

/** Strips any existing counter, so retrying never yields "photos (1) (2)". */
const baseNameOf = (name: string) => name.replace(/ \(\d+\)$/, '');

const suffixName = (name: string, attempt: number) =>
  attempt === 0 ? baseNameOf(name) : `${baseNameOf(name)} (${attempt})`;

/**
 * Appends without spreading.
 *
 * `target.push(...source)` passes every element as an argument and V8 throws
 * RangeError past roughly 100k of them, which a large folder reaches.
 */
function appendAll<T>(target: T[], source: readonly T[]): void {
  for (const item of source) target.push(item);
}

function totalBytesOf(files: readonly File[]): number {
  let total = 0;
  for (const file of files) total += file.size;
  return total;
}

/** Runs `worker` over `items` with at most `limit` in flight. */
async function withConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]!);
    }
  });
  await Promise.all(runners);
}

/**
 * Throws the signal's abort reason if it has already fired.
 *
 * `signal.reason` is always populated on abort (an AbortError DOMException by
 * default) in every runtime new enough to run this app, so no fallback reason
 * is manufactured here.
 */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason;
}

/**
 * Settles with `promise`, unless `signal` aborts first.
 *
 * The S3 listing call has no abort plumbing of its own, so a check that is
 * already on the wire cannot be torn down. What CAN be guaranteed is that
 * nobody waits on it: on abort the orphaned check keeps running in the
 * background and its eventual answer is discarded. The listener is removed
 * once the promise settles, so a long-lived signal does not accumulate one
 * closure per check.
 *
 * Exported for direct testing. planDrop itself cannot reach the pre-aborted
 * branch (there is no interleaving point between one check settling and the
 * next race attaching, so an abort always lands on a live listener), but the
 * helper must not hang if a future caller arrives with a dead signal.
 */
export function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    // The 'abort' event has already fired and will not fire again, so the
    // listener path below would hang. Absorb the doomed promise's eventual
    // rejection - its outcome stopped mattering when the user cancelled.
    promise.catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

/**
 * Collapses everything past `limit` into one overflow notice.
 *
 * The earliest notices are kept rather than the latest: they correspond to the
 * folders walked first, which is the order the user sees in the panel. The
 * overflow notice carries the total number of underlying ENTRIES it stands
 * for, not the number of notices it replaced, so the count the user reads is
 * the count of things that actually went missing.
 */
function capNotices(notices: QueueNotice[], limit = MAX_NOTICES): QueueNotice[] {
  if (notices.length <= limit) return notices;

  const kept = notices.slice(0, limit - 1);
  const dropped = notices.slice(limit - 1);
  const entries = dropped.reduce((sum, notice) => sum + notice.count, 0);

  kept.push({
    id: nextId('overflow'),
    kind: 'skipped',
    path: '',
    count: entries,
    detail: `${entries} further item(s) across ${dropped.length} other location(s) could not be uploaded.`,
  });

  return kept;
}

/**
 * Keeps the notice list bounded across repeated drops.
 *
 * Unlike `capNotices` this keeps the NEWEST, because notices accumulate over a
 * whole session: an unbounded array would grow one drop at a time even when
 * every individual drop was well behaved, and the notice a user is most likely
 * to still care about is the most recent one.
 */
function trimNotices(notices: QueueNotice[], limit = MAX_NOTICES): QueueNotice[] {
  return notices.length <= limit ? notices : notices.slice(notices.length - limit);
}

/**
 * Separates the two halves of a group key.
 *
 * NUL, because it is the one character that cannot occur in a path or in a
 * reason, so no two pairs can collide on a key. Written as an escape
 * deliberately: as a literal byte it is invisible in an editor and renders as
 * a space, which is how someone talks themselves into "fixing" it.
 */
const GROUP_SEPARATOR = '\u0000';

/**
 * Turns extraction losses into notices, collapsing floods.
 *
 * Grouped by the containing folder AND the reason, because "412 files in
 * node_modules could not be read" is one fact, while a permission error and a
 * missing file in the same folder are two.
 */
export function summariseSkipped(
  skipped: readonly SkippedEntry[],
  threshold = SKIPPED_GROUP_THRESHOLD
): QueueNotice[] {
  const groups = new Map<string, { parent: string; entries: SkippedEntry[] }>();

  for (const entry of skipped) {
    const slash = entry.path.lastIndexOf('/');
    const parent = slash === -1 ? '' : entry.path.slice(0, slash + 1);
    const key = `${parent}${GROUP_SEPARATOR}${entry.reason}`;
    const group = groups.get(key);
    if (group) group.entries.push(entry);
    else groups.set(key, { parent, entries: [entry] });
  }

  const notices: QueueNotice[] = [];

  for (const { parent, entries } of groups.values()) {
    const first = entries[0]!;

    if (entries.length > threshold) {
      notices.push({
        id: nextId('skipped'),
        kind: 'skipped',
        path: parent || first.path,
        count: entries.length,
        detail: `${first.path} and ${entries.length - 1} other item(s) in this folder ${first.reason} and were not uploaded.`,
      });
      continue;
    }

    for (const entry of entries) {
      notices.push({
        id: nextId('skipped'),
        kind: 'skipped',
        path: entry.path,
        count: 1,
        detail: `${entry.kind === 'folder' ? 'Folder' : 'File'} "${entry.path}" ${entry.reason} and was not uploaded.`,
      });
    }
  }

  return capNotices(notices);
}

const initialState = {
  isPlanning: false,
  claims: [] as PrefixClaim[],
  notices: [] as QueueNotice[],
};

export const useUploadQueueStore = create<UploadQueueState>((set, get) => ({
  ...initialState,

  reservePrefix: (name, destination, taskId, startAttempt = 0) => {
    const base = normalisePrefix(destination);
    const taken = new Set(get().claims.map((claim) => claim.prefix));

    for (let attempt = startAttempt; attempt <= MAX_SUFFIX_ATTEMPTS; attempt++) {
      const resolvedName = suffixName(name, attempt);
      // Exact match, not case-insensitive: S3 keys are case-sensitive, so
      // "Photos/" and "photos/" are genuinely different objects and must be
      // allowed to coexist. Folding case here would rename a folder the bucket
      // has no conflict with.
      const prefix = `${base}${resolvedName}/`;
      if (taken.has(prefix)) continue;

      set((state) => ({ claims: [...state.claims, { prefix, taskId, committed: false }] }));
      return { resolvedName, prefix, attempt };
    }

    // Attempts exhausted. A timestamp always terminates and is still better
    // than overwriting whatever is already there.
    const resolvedName = `${baseNameOf(name)} (${Date.now()})`;
    const prefix = `${base}${resolvedName}/`;
    set((state) => ({ claims: [...state.claims, { prefix, taskId, committed: false }] }));
    return { resolvedName, prefix, attempt: MAX_SUFFIX_ATTEMPTS + 1 };
  },

  planDrop: async (data, options) => {
    // A signal that is already dead means the caller has moved on: reserve
    // nothing, touch nothing.
    throwIfAborted(options.signal);

    const destination = normalisePrefix(options.destinationPrefix);
    const planned: PlannedUpload[] = [];
    // Hoisted above the try so the catch can give back what Phase A claimed.
    let reservations: FolderReservation[] = [];

    set({ isPlanning: true });

    try {
      // Extraction's losses carry through verbatim, aggregated so a locked
      // node_modules cannot flood the panel.
      const notices = summariseSkipped(data.skipped);

      // Loose files go straight to the destination. They collide at the object
      // level, which the existing per-file duplicate prompt already handles.
      if (data.individualFiles.length > 0) {
        const files: File[] = [];
        appendAll(files, data.individualFiles);

        planned.push({
          id: nextId('file-batch'),
          kind: 'file',
          originalName: '',
          resolvedName: '',
          prefix: destination,
          // Loose files never go through folder verification; their collisions
          // are object-level and the per-file duplicate prompt owns them.
          verification: 'unchecked',
          files,
          totalBytes: totalBytesOf(files),
        });
      }

      // --- Phase A: reserve every folder locally, synchronously. ------------
      // No awaits in this pass, so the drop is internally consistent in the
      // same tick: two folders named "photos" cannot both be told the name is
      // free. This is what the old bucket-only check could never do.
      reservations = data.folderStructures.map((folder) => {
        const taskId = nextId('folder');
        const reserved = get().reservePrefix(folder.name, destination, taskId);
        return { folder, taskId, verification: 'unchecked' as const, ...reserved };
      });

      // --- Phase B: verify against the bucket, in parallel. -----------------
      // Sequential checks would put one round-trip per folder in front of the
      // first byte. Bumping goes back through reservePrefix, which is
      // synchronous, so a bump cannot collide either.
      if (options.apiS3) {
        const api = options.apiS3;

        await withConcurrency(reservations, VERIFY_CONCURRENCY, async (reservation) => {
          let guard = 0;
          for (;;) {
            let taken: boolean;
            try {
              taken = await raceWithAbort(folderExists(api, reservation.prefix), options.signal);
            } catch (error) {
              if (options.signal?.aborted) throw error;

              // An error is NOT a collision. The first version of this catch
              // set `taken = true`, which read reasonably for a single check
              // and composed disastrously across the loop: with the network
              // down, the check of every bumped name failed too, so one folder
              // burned through all 100 suffixes, came out renamed, and shipped
              // a notice claiming a folder "was already here" that never
              // existed. Indeterminate means STOP: keep the name the
              // synchronous pass reserved (it is collision-safe within this
              // session), mark the plan so the executor knows the bucket never
              // answered, and tell the user the truth below.
              reservation.verification = 'failed';
              return;
            }

            if (!taken) {
              reservation.verification = 'confirmed';
              return;
            }

            get().releasePrefix(reservation.prefix);
            const bumped = get().reservePrefix(
              reservation.folder.name,
              destination,
              reservation.taskId,
              reservation.attempt + 1
            );
            reservation.prefix = bumped.prefix;
            reservation.resolvedName = bumped.resolvedName;
            reservation.attempt = bumped.attempt;

            if (++guard > MAX_SUFFIX_ATTEMPTS) {
              // The bucket answered "taken" a hundred times, so S3 was
              // reachable throughout, and the timestamp fallback this landed
              // on is outside the suffix space that was occupied. Not marked
              // 'failed' - that would claim a network problem there wasn't.
              reservation.verification = 'confirmed';
              return;
            }
          }
        });
      }

      // Every folder is planned, even if an earlier one had trouble. The old
      // loop returned on the first duplicate and silently dropped the rest.
      for (const reservation of reservations) {
        if (reservation.resolvedName !== reservation.folder.name) {
          notices.push({
            id: nextId('renamed'),
            kind: 'renamed',
            path: reservation.folder.name,
            count: 1,
            detail: `A folder named "${reservation.folder.name}" was already here, so this one is being uploaded as "${reservation.resolvedName}".`,
          });
        }

        if (reservation.verification === 'failed') {
          // Deliberately NOT describeFolderCheckError(): that message says the
          // action "was cancelled", and nothing here is cancelled - the folder
          // still uploads under its locally reserved name. Reusing it would
          // trade one fabricated message for another.
          notices.push({
            id: nextId('unverified'),
            kind: 'unverified',
            path: reservation.resolvedName,
            count: 1,
            detail: `Could not check whether "${reservation.resolvedName}" already exists here, so it is being uploaded under that name. If it does exist, files with matching names will be overwritten.`,
          });
        }

        const files: File[] = [];
        appendAll(files, reservation.folder.files);

        planned.push({
          id: reservation.taskId,
          kind: 'folder',
          originalName: reservation.folder.name,
          resolvedName: reservation.resolvedName,
          prefix: reservation.prefix,
          verification: reservation.verification,
          files,
          totalBytes: totalBytesOf(files),
        });
      }

      set((state) => ({ notices: trimNotices([...state.notices, ...notices]) }));
      return { planned, notices };
    } catch (error) {
      // Per-folder check failures are absorbed above, so the only throw that
      // reaches here is an abort. A cancelled plan must not keep its names:
      // nothing was uploaded, so there is nothing to protect, and a leaked
      // claim would suffix the user's next drop for no reason they can see.
      for (const reservation of reservations) get().releaseClaim(reservation.taskId);
      throw error;
    } finally {
      set({ isPlanning: false });
    }
  },

  commitClaim: (taskId) =>
    set((state) => ({
      claims: state.claims.map((claim) =>
        claim.taskId === taskId ? { ...claim, committed: true } : claim
      ),
    })),

  releaseClaim: (taskId) =>
    set((state) => ({
      claims: state.claims.filter((claim) => claim.taskId !== taskId || claim.committed),
    })),

  releasePrefix: (prefix) => {
    const target = normalisePrefix(prefix);
    set((state) => ({
      claims: state.claims.filter((claim) => claim.prefix !== target || claim.committed),
    }));
  },

  claimedPrefixes: () => get().claims.map((claim) => claim.prefix),

  dismissNotice: (id) =>
    set((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) })),

  clearNotices: () => set({ notices: [] }),

  reset: () => set({ isPlanning: false, claims: [], notices: [] }),
}));
