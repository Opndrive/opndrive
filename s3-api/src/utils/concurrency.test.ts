/**
 * `forEachWithConcurrency` is the bounded-parallelism primitive behind
 * `renameFolder`'s copy phase, where the input can be 100k+ keys. What matters
 * is that it never exceeds the limit, never skips an item, and never
 * materialises one promise per item.
 */

import { describe, it, expect, vi } from 'vitest';
import { forEachWithConcurrency } from './concurrency.js';

/** A promise plus the handles to settle it from the outside. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('forEachWithConcurrency', () => {
  it('runs the worker exactly once per item', async () => {
    const seen: number[] = [];

    await forEachWithConcurrency([10, 20, 30, 40], 2, async (item) => {
      seen.push(item);
    });

    expect(seen.sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
  });

  it('passes each item together with its original index', async () => {
    const pairs: Array<[string, number]> = [];

    await forEachWithConcurrency(['a', 'b', 'c'], 1, async (item, index) => {
      pairs.push([item, index]);
    });

    // Serial (concurrency 1), so the order is deterministic and the index must
    // track the position in the input, not the completion order.
    expect(pairs).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('never exceeds the concurrency limit', async () => {
    const gates = Array.from({ length: 10 }, () => deferred());
    let inFlight = 0;
    let peak = 0;

    const run = forEachWithConcurrency(gates, 3, async (gate) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await gate.promise;
      inFlight--;
    });

    // Let the runners start and park on their gates.
    await vi.waitFor(() => expect(inFlight).toBe(3));
    expect(peak).toBe(3);

    gates.forEach((g) => g.resolve());
    await run;

    expect(peak).toBe(3);
  });

  it('starts only as many runners as there are items', async () => {
    const gates = Array.from({ length: 2 }, () => deferred());
    let inFlight = 0;

    const run = forEachWithConcurrency(gates, 8, async (gate) => {
      inFlight++;
      await gate.promise;
      inFlight--;
    });

    // Math.min(concurrency, items.length) - asking for 8 runners over 2 items
    // must not spawn 6 idle promises.
    await vi.waitFor(() => expect(inFlight).toBe(2));

    gates.forEach((g) => g.resolve());
    await run;
  });

  it('pulls from a shared cursor, so a slow item does not stall the others', async () => {
    const slow = deferred();
    const order: number[] = [];

    const run = forEachWithConcurrency([0, 1, 2, 3], 2, async (item) => {
      if (item === 0) await slow.promise;
      order.push(item);
    });

    // Runner B works through 1, 2, 3 while runner A is still parked on 0.
    await vi.waitFor(() => expect(order).toEqual([1, 2, 3]));

    slow.resolve();
    await run;

    expect(order).toEqual([1, 2, 3, 0]);
  });

  it('resolves immediately for an empty list without invoking the worker', async () => {
    const worker = vi.fn();

    await expect(forEachWithConcurrency([], 4, worker)).resolves.toBeUndefined();
    expect(worker).not.toHaveBeenCalled();
  });

  it('KNOWN FOOTGUN: a concurrency of 0 silently processes nothing', async () => {
    const worker = vi.fn();

    await forEachWithConcurrency([1, 2, 3], 0, worker);

    // Math.min(0, 3) spawns zero runners, so the helper resolves successfully
    // having done no work at all - a caller that computes its concurrency
    // dynamically would see a silent no-op rather than an error. Pinned, not
    // endorsed: if this ever starts throwing or clamping to 1, this test SHOULD
    // fail so the change is a deliberate one.
    expect(worker).not.toHaveBeenCalled();
  });

  it('propagates a worker rejection to the caller', async () => {
    await expect(
      forEachWithConcurrency([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error('worker exploded');
      })
    ).rejects.toThrow('worker exploded');
  });

  it('abandons remaining items once a worker throws', async () => {
    const processed: number[] = [];

    // The throwing runner unwinds; Promise.all rejects on its first rejection.
    // renameFolder relies on this NOT happening, which is exactly why its copy
    // worker catches internally and accumulates errors instead of throwing.
    await expect(
      forEachWithConcurrency([1, 2, 3, 4, 5, 6], 1, async (item) => {
        if (item === 3) throw new Error('stop');
        processed.push(item);
      })
    ).rejects.toThrow('stop');

    expect(processed).toEqual([1, 2]);
  });
});
