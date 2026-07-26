/**
 * Runs `worker` over every item with at most `concurrency` in flight at once.
 *
 * Only `concurrency` promises exist at any moment - the runners pull from a
 * shared cursor rather than the caller materialising one promise per item,
 * which matters when operating on folders containing 100k+ objects.
 *
 * Returns nothing, deliberately: collecting a settled result per item would
 * allocate an array as large as the input, which is exactly the overhead this
 * helper exists to avoid at scale. Workers that need to record outcomes should
 * catch internally and accumulate only what they actually need (typically just
 * the failures).
 */
export async function forEachWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await worker(items[index], index);
    }
  });

  await Promise.all(runners);
}
