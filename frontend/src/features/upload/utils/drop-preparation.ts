'use client';

import { useUploadQueueStore } from '../stores/use-upload-queue-store';
import type { ProcessedDragData } from '../types/folder-upload-types';
import { FolderStructureProcessor } from './folder-structure-processor';

/**
 * How often the count of files found reaches the store while a drop is read.
 * Often enough to look alive, not so often that a folder of 50,000 files
 * re-renders the panel 50,000 times.
 */
const FOUND_REPORT_INTERVAL_MS = 150;

const queue = useUploadQueueStore;

/**
 * Counts `work` as a drop being prepared for as long as it runs.
 *
 * Between a drop arriving and its uploads starting, a large folder is read,
 * checked against the bucket and planned, and none of that showed anything:
 * the page looked as if the drop had been ignored. The upload panel shows a
 * line while any drop is in here.
 */
export async function whilePreparingDrop<T>(work: () => Promise<T>): Promise<T> {
  queue.setState((state) => ({ preparingDrops: state.preparingDrops + 1 }));
  try {
    return await work();
  } finally {
    queue.setState((state) => ({ preparingDrops: Math.max(0, state.preparingDrops - 1) }));
  }
}

/**
 * Reads a drop's files, counting it as being prepared and reporting how many
 * files have been found so far.
 *
 * The items are handed to the reader before anything is awaited: a
 * DataTransferItemList is only readable during the drop event itself.
 */
export function readDroppedItems(items: DataTransferItemList): Promise<ProcessedDragData> {
  let found = 0;
  let reported = 0;
  let lastReport = 0;

  const report = () => {
    const fresh = found - reported;
    if (fresh === 0) return;
    reported = found;
    lastReport = Date.now();
    queue.setState((state) => ({ filesFound: state.filesFound + fresh }));
  };

  queue.setState((state) => ({ readingDrops: state.readingDrops + 1 }));

  return whilePreparingDrop(() =>
    FolderStructureProcessor.processDataTransferItems(items, {
      onFileFound: () => {
        found++;
        if (Date.now() - lastReport >= FOUND_REPORT_INTERVAL_MS) report();
      },
    })
  ).finally(() => {
    queue.setState((state) => {
      const readingDrops = Math.max(0, state.readingDrops - 1);
      // The count is for drops still being read, so it starts again from
      // nothing once the last of them is done.
      return {
        readingDrops,
        filesFound: readingDrops === 0 ? 0 : state.filesFound + found - reported,
      };
    });
  });
}
