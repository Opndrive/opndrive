/**
 * Counting drops while they are prepared.
 *
 * The counts drive the "preparing" line in the upload panel and the guard
 * that asks before the tab closes, so the one thing they must never do is
 * stick: a count left above zero shows a spinner forever and prompts on every
 * close. Every test here ends by checking they are back at zero.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readDroppedItems, whilePreparingDrop } from './drop-preparation';
import { FolderStructureProcessor } from './folder-structure-processor';
import { useUploadQueueStore } from '../stores/use-upload-queue-store';
import {
  makeFile,
  mockDataTransferItem,
  mockDataTransferItemList,
  mockDirectoryEntry,
  mockFileEntry,
} from '@/tests/dnd-mocks';

const counts = () => {
  const { preparingDrops, readingDrops, filesFound } = useUploadQueueStore.getState();
  return { preparingDrops, readingDrops, filesFound };
};

const IDLE = { preparingDrops: 0, readingDrops: 0, filesFound: 0 };

beforeEach(() => {
  vi.restoreAllMocks();
  useUploadQueueStore.setState(IDLE);
});

describe('whilePreparingDrop', () => {
  it('counts the drop for exactly as long as the work runs', async () => {
    let release!: () => void;
    const work = whilePreparingDrop(() => new Promise<void>((resolve) => (release = resolve)));

    expect(counts().preparingDrops).toBe(1);
    release();
    await work;

    expect(counts()).toEqual(IDLE);
  });

  it('counts overlapping drops separately', async () => {
    let releaseFirst!: () => void;
    const first = whilePreparingDrop(() => new Promise<void>((r) => (releaseFirst = r)));
    const second = whilePreparingDrop(async () => {});

    expect(counts().preparingDrops).toBe(2);
    await second;
    // The second finishing must not end the first.
    expect(counts().preparingDrops).toBe(1);

    releaseFirst();
    await first;
    expect(counts()).toEqual(IDLE);
  });

  it('stops counting a drop whose work failed, and passes the failure on', async () => {
    await expect(
      whilePreparingDrop(async () => {
        throw new Error('planning failed');
      })
    ).rejects.toThrow('planning failed');

    expect(counts()).toEqual(IDLE);
  });
});

describe('readDroppedItems', () => {
  const folderOf = (count: number) =>
    mockDataTransferItemList([
      mockDataTransferItem(
        mockDirectoryEntry(
          'photos',
          Array.from({ length: count }, (_, i) => mockFileEntry(makeFile(`${i}.jpg`)))
        )
      ),
    ]);

  it('counts the drop as being read until it has been, then lets go', async () => {
    const reading = readDroppedItems(folderOf(3));

    expect(counts()).toMatchObject({ preparingDrops: 1, readingDrops: 1 });

    const data = await reading;
    expect(data.folderStructures[0]!.files).toHaveLength(3);
    expect(counts()).toEqual(IDLE);
  });

  it('reports files as they are found', async () => {
    const seen: number[] = [];
    const unsubscribe = useUploadQueueStore.subscribe((state) => seen.push(state.filesFound));

    await readDroppedItems(folderOf(5));
    unsubscribe();

    // The first file is reported at once, so the panel shows a number
    // straight away rather than after the first interval.
    expect(seen.some((found) => found > 0)).toBe(true);
    expect(counts().filesFound).toBe(0);
  });

  it('keeps the count of a drop still being read when another finishes', async () => {
    useUploadQueueStore.setState({ readingDrops: 1, preparingDrops: 1, filesFound: 40 });

    await readDroppedItems(folderOf(2));

    // Another drop is still going, so its files found so far stay up, and
    // this one's are added to them.
    expect(counts()).toEqual({ preparingDrops: 1, readingDrops: 1, filesFound: 42 });
  });

  it('lets go of a read that failed, and passes the failure on', async () => {
    vi.spyOn(FolderStructureProcessor, 'processDataTransferItems').mockRejectedValue(
      new Error('NotReadableError')
    );

    await expect(readDroppedItems(folderOf(1))).rejects.toThrow('NotReadableError');

    expect(counts()).toEqual(IDLE);
  });

  it('hands the items to the reader before anything is awaited', async () => {
    // A DataTransferItemList is neutered once the drop event returns.
    const list = folderOf(1);

    const reading = readDroppedItems(list);
    list.neuter();

    await expect(reading).resolves.toMatchObject({
      folderStructures: [expect.objectContaining({ name: 'photos' })],
    });
  });
});
