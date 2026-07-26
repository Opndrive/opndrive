/**
 * Maps `items` through `worker` with at most `concurrency` in flight at once.
 *
 * Unlike Promise.all, this bounds how many requests are outstanding
 * simultaneously - important when issuing S3 operations in the thousands,
 * where unbounded concurrency risks tripping provider rate limits.
 *
 * A rejection from one item does not stop the others; the corresponding
 * result entry is a rejected settlement, mirroring Promise.allSettled, so
 * callers can process every outcome (including failures) after the fact.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        const value = await worker(items[index], index);
        results[index] = { status: 'fulfilled', value };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  });

  await Promise.all(runners);
  return results;
}
