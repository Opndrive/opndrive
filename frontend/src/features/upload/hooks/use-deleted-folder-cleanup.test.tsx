/**
 * Cleaning up after a deleted folder: the upload names it was holding.
 *
 * A folder uploaded this session keeps its name reserved, so a second drop of
 * the same name goes to "photos (1)" rather than over the first. Deleting the
 * folder never gave the name back, so the next "photos" dropped after the
 * delete was still renamed, next to nothing at all of that name.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const executor = vi.hoisted(() => ({
  current: null as null | { uploadsFor: (taskId: string) => string[] },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/dashboard/browse',
}));
vi.mock('@/context/data-context', () => {
  const drive = { currentPrefix: '/', rootPrefix: '/', removeDeletedFolder: vi.fn() };
  return {
    useDriveStore: Object.assign((selector: (state: typeof drive) => unknown) => selector(drive), {
      getState: () => drive,
    }),
  };
});
vi.mock('../context/upload-context', () => ({ useUploadExecutor: () => executor.current }));

import { useDeletedFolderCleanup } from './use-deleted-folder-cleanup';
import { useUploadQueueStore } from '../stores/use-upload-queue-store';

const queue = () => useUploadQueueStore.getState();

/** Reserves and commits a folder name, as a finished upload leaves it. */
function uploaded(name: string, destination: string, taskId: string) {
  queue().reservePrefix(name, destination, taskId);
  queue().commitClaim(taskId);
}

beforeEach(() => {
  queue().reset();
  executor.current = { uploadsFor: () => [] };
});

describe('after a folder is deleted', () => {
  it('lets the next drop of that name keep its name', async () => {
    uploaded('photos', '', 'task-1');
    const cleanUp = renderHook(() => useDeletedFolderCleanup()).result.current;

    cleanUp('photos/');

    const { planned } = await queue().planDrop(
      {
        individualFiles: [],
        folderStructures: [
          {
            name: 'photos',
            files: [new File(['x'], 'a.jpg')],
            totalSize: 1,
            relativePath: 'photos',
          },
        ],
        skipped: [],
      },
      { destinationPrefix: '' }
    );

    expect(planned[0]!.resolvedName).toBe('photos');
  });

  it('gives back every name inside the deleted folder too', () => {
    uploaded('photos', 'docs', 'task-1');
    uploaded('videos', 'docs', 'task-2');
    uploaded('photos', 'other', 'task-3');
    const cleanUp = renderHook(() => useDeletedFolderCleanup()).result.current;

    cleanUp('docs/');

    expect(queue().claimedPrefixes()).toEqual(['other/photos/']);
  });

  it('does not touch a name that only starts the same way', () => {
    // "photos-2026/" is not inside "photos/".
    uploaded('photos-2026', '', 'task-1');
    const cleanUp = renderHook(() => useDeletedFolderCleanup()).result.current;

    cleanUp('photos/');

    expect(queue().claimedPrefixes()).toEqual(['photos-2026/']);
  });

  it('keeps the name of a drop still being planned into it', () => {
    // Reserved, but not yet handed to the executor, which knows nothing of it.
    // Released, a second drop of the same name could be given the same prefix
    // while this one is still on its way, and the two would mix.
    queue().reservePrefix('photos', 'docs', 'task-planning');
    const cleanUp = renderHook(() => useDeletedFolderCleanup()).result.current;

    cleanUp('docs/');

    expect(queue().claimedPrefixes()).toEqual(['docs/photos/']);
  });

  it('keeps the name of a folder still being uploaded into', () => {
    // Its files are still arriving. Handing the name to a new drop would mix
    // the two folders' files under one prefix.
    uploaded('photos', 'docs', 'task-live');
    uploaded('videos', 'docs', 'task-done');
    executor.current = {
      uploadsFor: (taskId) => (taskId === 'task-live' ? ['upload-1'] : []),
    };
    const cleanUp = renderHook(() => useDeletedFolderCleanup()).result.current;

    cleanUp('docs/');

    expect(queue().claimedPrefixes()).toEqual(['docs/photos/']);
  });
});
