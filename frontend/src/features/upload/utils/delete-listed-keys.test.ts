/**
 * deleteListedKeys: listing and deleting at once, without giving up the
 * ordering the one-at-a-time version had.
 *
 * Pages and batches are both hand-released here, so a test can hold a batch
 * in flight while the listing moves on, or hold the listing while batches
 * come back, and check what has been sent at each point.
 */

import { describe, it, expect, vi } from 'vitest';
import { deleteListedKeys, type BatchOutcome } from './delete-listed-keys';

const MARKER = 'docs/';
const keys = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => `docs/f${from + i}.txt`);

/** A batch the test resolves, rejects, or leaves in flight. */
function deferredBatch() {
  let resolve!: (outcome: BatchOutcome) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<BatchOutcome>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A sender that records each batch and lets the test settle it. */
function heldSender() {
  const sent: { keys: string[]; batch: ReturnType<typeof deferredBatch> }[] = [];
  const send = vi.fn((batchKeys: string[]) => {
    const batch = deferredBatch();
    sent.push({ keys: batchKeys, batch });
    return batch.promise;
  });
  const ok = (i: number) => sent[i]!.batch.resolve({ deleted: sent[i]!.keys.length, errors: [] });
  return { sent, send, ok };
}

/** A sender that succeeds at once. */
const instantSender = () =>
  vi.fn(async (batchKeys: string[]): Promise<BatchOutcome> => ({
    deleted: batchKeys.length,
    errors: [],
  }));

async function* pagesOf(...pages: string[][]) {
  for (const page of pages) yield page;
}

/** Pages the test releases one at a time. */
function heldPages() {
  const waiting: ((page: string[] | null) => void)[] = [];
  let returned = false;
  const pages = {
    async *[Symbol.asyncIterator]() {
      try {
        for (;;) {
          const page = await new Promise<string[] | null>((resolve) => waiting.push(resolve));
          if (page === null) return;
          yield page;
        }
      } finally {
        returned = true;
      }
    },
  };
  return {
    pages,
    release: (page: string[] | null) => waiting.shift()!(page),
    isWaiting: () => waiting.length > 0,
    wasStopped: () => returned,
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const live = () => new AbortController().signal;

describe('batches', () => {
  it('sends full batches, then the rest with the marker at its very end', async () => {
    const send = instantSender();

    await deleteListedKeys({
      pages: pagesOf([MARKER, ...keys(0, 1000)], keys(1000, 2000), keys(2000, 2500)),
      marker: MARKER,
      send,
      signal: live(),
    });

    const batches = send.mock.calls.map(([batch]) => batch);
    expect(batches.map((batch) => batch.length)).toEqual([1000, 1000, 501]);
    expect(batches.at(-1)!.at(-1)).toBe(MARKER);
    expect(batches.flat().filter((key) => key === MARKER)).toHaveLength(1);
  });

  it('adds the marker even when the listing never returns it', async () => {
    const send = instantSender();

    await deleteListedKeys({
      pages: pagesOf(['docs/a.txt']),
      marker: MARKER,
      send,
      signal: live(),
    });

    expect(send.mock.calls.map(([batch]) => batch)).toEqual([['docs/a.txt', MARKER]]);
  });

  it('deletes just the marker for a folder with nothing in it', async () => {
    const send = instantSender();

    await deleteListedKeys({ pages: pagesOf([]), marker: MARKER, send, signal: live() });

    expect(send.mock.calls.map(([batch]) => batch)).toEqual([[MARKER]]);
  });

  it('reports what it sent and what was deleted', async () => {
    const send = vi.fn(async (batch: string[]): Promise<BatchOutcome> => ({
      deleted: batch.length - 1,
      errors: [{ key: batch[0]!, code: 'AccessDenied' }],
    }));

    const result = await deleteListedKeys({
      pages: pagesOf(keys(0, 1500)),
      marker: MARKER,
      send,
      signal: live(),
    });

    // Refused objects do not stop the delete, the marker included: they are
    // collected for the caller to report.
    expect(result).toEqual({
      total: 1501,
      deleted: 1499,
      failures: [
        { key: 'docs/f0.txt', code: 'AccessDenied' },
        { key: 'docs/f1000.txt', code: 'AccessDenied' },
      ],
    });
  });
});

describe('overlap', () => {
  it('starts deleting before the listing has finished', async () => {
    // The point of this: the first thousand go while the rest is listed.
    const listing = heldPages();
    const send = instantSender();

    const deleting = deleteListedKeys({
      pages: listing.pages,
      marker: MARKER,
      send,
      signal: live(),
    });

    listing.release(keys(0, 1000));
    await tick();
    expect(send).toHaveBeenCalledOnce();
    expect(listing.isWaiting()).toBe(true);

    listing.release(null);
    await deleting;
  });

  it('keeps at most four batches in flight', async () => {
    const { sent, send, ok } = heldSender();

    const deleting = deleteListedKeys({
      pages: pagesOf(keys(0, 7000)),
      marker: MARKER,
      send,
      signal: live(),
    });
    await tick();

    expect(sent).toHaveLength(4);
    ok(0);
    await tick();
    expect(sent).toHaveLength(5);

    for (let i = 1; i < 7; i++) {
      ok(i);
      await tick();
    }
    ok(7);
    await deleting;
    expect(sent).toHaveLength(8);
  });

  it('sends the final batch only once every other batch has come back', async () => {
    // Sent alongside the others, the marker could be gone before what it
    // holds, leaving files with no folder above them.
    const { sent, send, ok } = heldSender();

    const deleting = deleteListedKeys({
      pages: pagesOf(keys(0, 2500)),
      marker: MARKER,
      send,
      signal: live(),
    });
    await tick();
    expect(sent).toHaveLength(2);

    ok(1);
    await tick();
    // The second came back, the first has not: still no final batch.
    expect(sent).toHaveLength(2);

    ok(0);
    await tick();
    expect(sent).toHaveLength(3);
    expect(sent[2]!.keys.at(-1)).toBe(MARKER);

    ok(2);
    await deleting;
  });

  it('tells the caller what has been listed before sending any of it', async () => {
    // So the recovery record exists before the first object is gone.
    const events: string[] = [];
    const send = vi.fn(async (batch: string[]): Promise<BatchOutcome> => {
      events.push(`sent ${batch.length}`);
      return { deleted: batch.length, errors: [] };
    });

    await deleteListedKeys({
      pages: pagesOf(keys(0, 1000), keys(1000, 1200)),
      marker: MARKER,
      send,
      signal: live(),
      onListed: (listed) => events.push(`listed ${listed}`),
    });

    expect(events).toEqual(['listed 1001', 'sent 1000', 'listed 1201', 'sent 201']);
  });
});

describe('stopping', () => {
  it('sends nothing new once cancelled, and waits for what is in flight', async () => {
    const controller = new AbortController();
    const { sent, send, ok } = heldSender();
    const listing = heldPages();

    const deleting = deleteListedKeys({
      pages: listing.pages,
      marker: MARKER,
      send,
      signal: controller.signal,
    });
    listing.release(keys(0, 2000));
    await tick();
    expect(sent).toHaveLength(2);

    // Logout, or the user cancelling, with two batches already out.
    controller.abort();
    listing.release(keys(2000, 3000));
    await tick();

    let settled = false;
    void deleting.catch(() => (settled = true));
    await tick();
    // Not reported yet: what was in flight has to come back first.
    expect(settled).toBe(false);

    ok(0);
    ok(1);
    await expect(deleting).rejects.toMatchObject({ name: 'AbortError' });
    // The third page was never sent, and neither was the marker.
    expect(sent).toHaveLength(2);
    expect(listing.wasStopped()).toBe(true);
  });

  it('stops at the first batch that fails, and throws its error', async () => {
    const { sent, send, ok } = heldSender();

    const deleting = deleteListedKeys({
      pages: pagesOf(keys(0, 6000)),
      marker: MARKER,
      send,
      signal: live(),
    });
    await tick();
    expect(sent).toHaveLength(4);

    sent[1]!.batch.reject(new Error('network down'));
    await tick();
    ok(0);
    ok(2);
    ok(3);

    await expect(deleting).rejects.toThrow('network down');
    expect(sent).toHaveLength(4);
    expect(sent.flat().some((s) => s.keys.includes(MARKER))).toBe(false);
  });

  it('throws a listing that failed, once what was sent has come back', async () => {
    async function* failing() {
      yield keys(0, 1000);
      throw new Error('SlowDown');
    }
    const { sent, send, ok } = heldSender();

    const deleting = deleteListedKeys({ pages: failing(), marker: MARKER, send, signal: live() });
    await tick();
    expect(sent).toHaveLength(1);

    ok(0);
    await expect(deleting).rejects.toThrow('SlowDown');
    expect(sent).toHaveLength(1);
  });
});
