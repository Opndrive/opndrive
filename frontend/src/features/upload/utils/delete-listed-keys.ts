/**
 * Deletes everything a listing yields, while it is still listing.
 *
 * A folder delete used to list every key first and only then delete them, one
 * batch of a thousand after another. For a folder of 100,000 objects that is
 * 100 listing requests before the first object goes, then 100 deletes in
 * single file. Here a batch goes out as soon as a thousand keys have been
 * listed, with a few in flight at once, so listing and deleting overlap.
 *
 * Two rules from the sequential version hold exactly:
 *
 *  - The folder's own marker object goes last, in the final batch, and that
 *    batch is only sent once every other batch has come back. Sent alongside
 *    them, it could land first and leave contents with no folder above them.
 *    The batches themselves come out the same as before: full batches of a
 *    thousand, then the remainder with the marker at its end.
 *  - A batch that throws stops the delete. Nothing new is sent, the batches
 *    already in flight are waited for, and the first error is what is thrown.
 *    Per-object refusals inside a batch do not stop it; they are collected.
 */

/** S3's ceiling for one DeleteObjects request. */
export const DELETE_BATCH_SIZE = 1000;

/**
 * How many delete batches are in flight at once.
 *
 * Four thousand objects in flight is well inside what S3 accepts for one
 * prefix, and the SDK backs off on its own if a provider asks it to slow down.
 */
export const DELETE_CONCURRENCY = 4;

export interface BatchOutcome {
  deleted: number;
  errors: { key: string; versionId?: string; code?: string; message?: string }[];
}

export interface DeleteListedKeysOptions {
  pages: AsyncIterable<string[]>;
  /** The folder's own marker key, ending in '/'. Deleted last, always. */
  marker: string;
  send: (keys: string[]) => Promise<BatchOutcome>;
  signal: AbortSignal;
  /**
   * Called once a page has been listed and before any of it is sent, with
   * the number of keys known so far, the marker included.
   */
  onListed?: (listed: number) => void;
  /** Called as each batch comes back. */
  onBatchDone?: (progress: { processed: number; deleted: number; listed: number }) => void;
  concurrency?: number;
  batchSize?: number;
}

export interface DeleteListedKeysResult {
  /** Keys sent for deletion, the marker included. */
  total: number;
  deleted: number;
  failures: BatchOutcome['errors'];
}

/** Thrown when the signal fires. Recognised by `error.name`, like other aborts. */
function abortError(): Error {
  const error = new Error('Operation cancelled');
  error.name = 'AbortError';
  return error;
}

export async function deleteListedKeys({
  pages,
  marker,
  send,
  signal,
  onListed,
  onBatchDone,
  concurrency = DELETE_CONCURRENCY,
  batchSize = DELETE_BATCH_SIZE,
}: DeleteListedKeysOptions): Promise<DeleteListedKeysResult> {
  const buffer: string[] = [];
  const inFlight = new Set<Promise<void>>();
  const failures: BatchOutcome['errors'] = [];
  // Typed this way so TypeScript does not narrow it to null for good: it is
  // only ever set inside the callbacks below.
  let failure = null as { error: unknown } | null;
  // The marker counts as listed from the start: it is deleted whether or not
  // the listing returns it.
  let listed = 1;
  let processed = 0;
  let deleted = 0;

  const stopped = () => failure !== null || signal.aborted;
  // A function, so each call reads `failure` afresh rather than as narrowed.
  const throwIfFailed = () => {
    if (failure) throw failure.error;
  };

  const dispatch = (keys: string[]) => {
    const request: Promise<void> = send(keys).then(
      (outcome) => {
        processed += keys.length;
        deleted += outcome.deleted;
        for (const error of outcome.errors) failures.push(error);
        onBatchDone?.({ processed, deleted, listed });
      },
      (error: unknown) => {
        failure ??= { error };
      }
    );
    const tracked = request.finally(() => inFlight.delete(tracked));
    inFlight.add(tracked);
  };

  /** Waits for a free slot, or for everything in flight when `all`. */
  const drain = async (all = false) => {
    while (inFlight.size > 0 && (all || inFlight.size >= concurrency)) {
      await Promise.race(inFlight);
    }
  };

  try {
    for await (const page of pages) {
      if (stopped()) break;

      for (const key of page) {
        // Held back for the final batch; counted already.
        if (key === marker) continue;
        buffer.push(key);
        listed++;
      }
      onListed?.(listed);

      while (buffer.length >= batchSize && !stopped()) {
        await drain();
        if (stopped()) break;
        dispatch(buffer.splice(0, batchSize));
      }
    }
  } finally {
    // A listing that threw, or a break above, still waits for what was sent:
    // the caller has to know what was deleted before it reports anything.
    await drain(true);
  }

  if (signal.aborted) throw abortError();
  throwIfFailed();

  // The final batch: whatever is left, and the marker at the very end. Sent
  // only now that every batch before it has come back. The loop leaves fewer
  // than `batchSize` keys behind, so this always fits in one request.
  dispatch([...buffer, marker]);
  await drain(true);
  throwIfFailed();

  return { total: listed, deleted, failures };
}
