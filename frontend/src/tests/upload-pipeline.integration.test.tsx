/**
 * The upload pipeline, end to end.
 *
 * Everything below runs for real: drag-and-drop extraction, the queue store's
 * two-phase planning, the executor, s3-api's `UploadManager`, the real
 * `MultipartUploader`, the upload store's cards, and the notices component.
 * The only substitution is the wire, and both edges of it - the listing/metadata
 * calls planning makes, and the multipart commands the uploader sends - are
 * backed by one shared in-memory bucket.
 *
 * That shared bucket is the whole point. Per-layer unit tests can each pass
 * while the seam between them is wrong: the double-nesting bug in Phase 5 Part 1
 * was invisible to both the planner's tests and the uploader's tests, because
 * neither owned the key. Here, an upload that lands in the wrong place is
 * visible as a wrong key in `bucket.objects`, and a folder uploaded in one drop
 * is genuinely found by the next drop's collision check.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

import { createFakeBucket, type FakeBucket } from './fake-bucket';
import {
  mockDirectoryEntry,
  mockFileEntry,
  mockDataTransferItem,
  mockDataTransferItemList,
  makeFile,
} from './dnd-mocks';

const managerRef: { current: unknown } = { current: null };
vi.mock('@/hooks/use-auth', () => ({
  useActiveUploadManager: () => managerRef.current,
}));

import { UploadManager } from '@opndrive/s3-api';
import { FolderStructureProcessor } from '@/features/upload/utils/folder-structure-processor';
import { useUploadDispatch } from '@/features/upload/hooks/use-upload-dispatch';
import { UploadProvider } from '@/features/upload/context/upload-context';
import { QueueNotices } from '@/features/upload/components/queue-notices';
import { useUploadQueueStore } from '@/features/upload/stores/use-upload-queue-store';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import type { ProcessedDragData } from '@/features/upload/types/folder-upload-types';

const queue = () => useUploadQueueStore.getState();
const uploads = () => useUploadStore.getState().uploads;

let bucket: FakeBucket;
let manager: UploadManager;

/**
 * Mounts the provider and returns the dispatch the dashboard pages call.
 *
 * The executor is built inside the provider exactly as it is in the app, so the
 * lifecycle under test is the real one.
 */
function mountPipeline() {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <UploadProvider>{children}</UploadProvider>
  );
  const { result } = renderHook(() => useUploadDispatch(), { wrapper });
  return result;
}

/** Lets queued microtasks and the manager's detached workers finish. */
async function settle(times = 12) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Builds a real drop payload by running extraction over mocked entry APIs. */
async function dropOfFolder(
  name: string,
  files: { path: string; failWith?: Error }[]
): Promise<ProcessedDragData> {
  // Group by the first segment below the folder so nested directories are real
  // directories, not flattened names.
  const children = files.map((f) =>
    mockFileEntry(makeFile(f.path.split('/').pop()!), { failWith: f.failWith })
  );
  const entry = mockDirectoryEntry(name, children);
  const list = mockDataTransferItemList([mockDataTransferItem(entry)]);
  return FolderStructureProcessor.processDataTransferItems(list);
}

beforeEach(async () => {
  bucket = createFakeBucket();
  await UploadManager.disposeInstance();
  manager = UploadManager.getInstance({
    s3: bucket.s3Client as never,
    bucket: 'test-bucket',
    prefix: '',
    maxConcurrency: 3,
    partSizeMB: 5,
  });
  managerRef.current = manager;
  useUploadStore.setState({ uploads: {}, duplicateQueue: [] });
  localStorage.clear();
});

describe('1. the full happy path', () => {
  it('carries a nested folder from drop to stored object', async () => {
    const data = await dropOfFolder('photos', [{ path: 'a.jpg' }, { path: 'b.jpg' }]);
    const dispatch = mountPipeline();

    let outcome!: Awaited<ReturnType<ReturnType<typeof useUploadDispatch>>>;
    await act(async () => {
      outcome = await dispatch.current(data, '', bucket.apiS3);
    });
    await settle();

    // The bucket really has the objects, under the planned prefix.
    expect([...bucket.objects.keys()].sort()).toEqual(['photos/a.jpg', 'photos/b.jpg']);
    // Not one key repeats the dropped folder name - the Part 1 nesting bug.
    expect([...bucket.objects.keys()].every((k) => !k.includes('photos/photos'))).toBe(true);

    // A real multipart round trip happened, not a shortcut.
    expect(bucket.commands).toContain('CreateMultipartUploadCommand');
    expect(bucket.commands).toContain('UploadPartCommand');
    expect(bucket.commands).toContain('CompleteMultipartUploadCommand');
    expect(bucket.openUploads.size).toBe(0);

    // The claim was committed, because bytes landed.
    const taskId = outcome.dispatched[0]!.taskId;
    expect(queue().claims[0]).toMatchObject({ prefix: 'photos/', committed: true });

    // And the UI reflects completion.
    expect(uploads()[taskId]).toMatchObject({ type: 'folder', name: 'photos' });
    const fileCards = Object.values(uploads()).filter((u) => u.type === 'file');
    expect(fileCards).toHaveLength(2);
    expect(fileCards.every((c) => c.status === 'completed')).toBe(true);
    expect(fileCards.every((c) => c.progress === 100)).toBe(true);
  });

  it('does not re-render the notice list while progress ticks', async () => {
    // The panel churns during an upload; the notices subscribe to a store no
    // progress event touches, so they must sit still.
    let commits = 0;
    render(
      <React.Profiler id="n" onRender={() => (commits += 1)}>
        <QueueNotices />
      </React.Profiler>
    );
    const baseline = commits;

    const data = await dropOfFolder('photos', [{ path: 'a.jpg' }]);
    const dispatch = mountPipeline();
    await act(async () => {
      await dispatch.current(data, '', bucket.apiS3);
    });
    await settle();

    // A clean drop produces no notices, so nothing here should have rendered.
    expect(queue().notices).toEqual([]);
    expect(commits).toBe(baseline);
  });
});

describe('2. the collision and suffix path', () => {
  it('separates two folders of the same name in one drop', async () => {
    const first = await dropOfFolder('photos', [{ path: 'a.jpg' }]);
    const second = await dropOfFolder('photos', [{ path: 'b.jpg' }]);
    const combined: ProcessedDragData = {
      individualFiles: [],
      folderStructures: [...first.folderStructures, ...second.folderStructures],
      skipped: [],
    };
    const dispatch = mountPipeline();

    await act(async () => {
      await dispatch.current(combined, '', bucket.apiS3);
    });
    await settle();

    // Both survived. Before the two-phase reservation the second overwrote
    // the first, because neither existed in the bucket when it was checked.
    expect([...bucket.objects.keys()].sort()).toEqual(['photos (1)/b.jpg', 'photos/a.jpg']);
    expect(queue().notices.map((n) => n.kind)).toEqual(['renamed']);
  });

  it('suffixes against a folder a previous drop actually uploaded', async () => {
    // The interaction only a shared bucket can exercise: drop one, let it
    // land, drop the same name again and see the real listing find it.
    const dispatch = mountPipeline();

    await act(async () => {
      await dispatch.current(await dropOfFolder('photos', [{ path: 'a.jpg' }]), '', bucket.apiS3);
    });
    await settle();
    expect([...bucket.objects.keys()]).toEqual(['photos/a.jpg']);

    await act(async () => {
      await dispatch.current(await dropOfFolder('photos', [{ path: 'b.jpg' }]), '', bucket.apiS3);
    });
    await settle();

    expect([...bucket.objects.keys()].sort()).toEqual(['photos (1)/b.jpg', 'photos/a.jpg']);
  });

  it('nests a renamed folder under the resolved name, not the original', async () => {
    bucket.put('photos/existing.jpg');
    const dispatch = mountPipeline();

    await act(async () => {
      await dispatch.current(await dropOfFolder('photos', [{ path: 'a.jpg' }]), '', bucket.apiS3);
    });
    await settle();

    expect(bucket.objects.has('photos (1)/a.jpg')).toBe(true);
    expect(bucket.objects.has('photos (1)/photos/a.jpg')).toBe(false);
  });
});

describe('3. the permission lock and skip path', () => {
  it('reports locked files and still uploads the readable ones', async () => {
    const data = await dropOfFolder('photos', [
      { path: 'ok.jpg' },
      { path: 'locked1.raw', failWith: new Error('EACCES') },
      { path: 'locked2.raw', failWith: new Error('EACCES') },
    ]);
    const dispatch = mountPipeline();

    await act(async () => {
      await dispatch.current(data, '', bucket.apiS3);
    });
    await settle();

    expect(data.skipped).toHaveLength(2);
    expect([...bucket.objects.keys()]).toEqual(['photos/ok.jpg']);
    expect(queue().notices.filter((n) => n.kind === 'skipped').length).toBeGreaterThan(0);
  });

  it('keeps the panel visible when every file was locked', async () => {
    // Zero uploads start, so the operations list is empty. Without the notice
    // the user would be left with nothing on screen at all.
    const data = await dropOfFolder('photos', [
      { path: 'a.raw', failWith: new Error('EACCES') },
      { path: 'b.raw', failWith: new Error('EACCES') },
    ]);
    const dispatch = mountPipeline();

    await act(async () => {
      await dispatch.current(data, '', bucket.apiS3);
    });
    await settle();

    expect(bucket.objects.size).toBe(0);
    expect(queue().notices.length).toBeGreaterThan(0);

    render(<QueueNotices />);
    expect(screen.getByTestId('queue-notices')).toBeTruthy();
    expect(screen.getAllByTestId('queue-notice').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/could not be read/i).length).toBeGreaterThan(0);
  });

  it('lets the user dismiss what it reported', async () => {
    const data = await dropOfFolder('photos', [{ path: 'a.raw', failWith: new Error('EACCES') }]);
    const dispatch = mountPipeline();
    await act(async () => {
      await dispatch.current(data, '', bucket.apiS3);
    });
    await settle();

    render(<QueueNotices />);
    fireEvent.click(screen.getByText('Clear all'));

    expect(queue().notices).toEqual([]);
    expect(screen.queryByTestId('queue-notices')).toBeNull();
  });
});

describe('4. the cancellation and claim release path', () => {
  it('aborts the multipart upload and frees the prefix', async () => {
    bucket.holdParts();
    const data = await dropOfFolder('photos', [{ path: 'a.jpg' }, { path: 'b.jpg' }]);
    const dispatch = mountPipeline();

    let outcome!: Awaited<ReturnType<ReturnType<typeof useUploadDispatch>>>;
    await act(async () => {
      outcome = await dispatch.current(data, '', bucket.apiS3);
    });
    await settle(4);

    // Mid-stream: the multipart upload exists, no bytes are committed.
    expect(bucket.openUploads.size).toBeGreaterThan(0);
    expect(bucket.objects.size).toBe(0);
    expect(queue().claims[0]).toMatchObject({ prefix: 'photos/', committed: false });

    const taskId = outcome.dispatched[0]!.taskId;
    await act(async () => {
      await Promise.all(outcome.dispatched[0]!.files.map((f) => manager.cancelUpload(f.uploadId)));
    });
    bucket.release();
    await settle();

    // S3 was told to abort, and the name is available again.
    expect(bucket.commands).toContain('AbortMultipartUploadCommand');
    expect(bucket.aborted.length).toBeGreaterThan(0);
    expect(bucket.objects.size).toBe(0);
    expect(queue().claimedPrefixes()).toEqual([]);
    expect(taskId).toBeTruthy();
  });

  it('gives the freed name to the next drop of the same folder', async () => {
    // The reason releasing matters: a cancelled upload must not push the
    // user's retry to "photos (1)" against an empty bucket.
    bucket.holdParts();
    const dispatch = mountPipeline();
    let outcome!: Awaited<ReturnType<ReturnType<typeof useUploadDispatch>>>;
    await act(async () => {
      outcome = await dispatch.current(
        await dropOfFolder('photos', [{ path: 'a.jpg' }]),
        '',
        bucket.apiS3
      );
    });
    await settle(4);

    await act(async () => {
      await Promise.all(outcome.dispatched[0]!.files.map((f) => manager.cancelUpload(f.uploadId)));
    });
    bucket.release();
    await settle();
    expect(queue().claimedPrefixes()).toEqual([]);

    await act(async () => {
      await dispatch.current(await dropOfFolder('photos', [{ path: 'a.jpg' }]), '', bucket.apiS3);
    });
    await settle();

    expect([...bucket.objects.keys()]).toEqual(['photos/a.jpg']);
  });

  it('keeps the prefix when bytes had already landed', async () => {
    // A completed file means real data at that prefix, so cancelling the rest
    // must NOT hand the name back.
    const data = await dropOfFolder('photos', [{ path: 'a.jpg' }]);
    const dispatch = mountPipeline();
    let outcome!: Awaited<ReturnType<ReturnType<typeof useUploadDispatch>>>;
    await act(async () => {
      outcome = await dispatch.current(data, '', bucket.apiS3);
    });
    await settle();
    expect(queue().claims[0]!.committed).toBe(true);

    await act(async () => {
      await manager.cancelUpload(outcome.dispatched[0]!.files[0]!.uploadId);
    });
    await settle();

    expect(queue().claimedPrefixes()).toEqual(['photos/']);
  });
});

describe('5. the network failure and unverified path', () => {
  it('halts verification instead of retrying into a dead network', async () => {
    bucket.failListings(new Error('503 Service Unavailable'));
    const data = await dropOfFolder('photos', [{ path: 'a.jpg' }]);
    const dispatch = mountPipeline();

    await act(async () => {
      await dispatch.current(data, '', bucket.apiS3);
    });
    await settle();

    // One check, not the 101 the old conflated catch produced.
    expect(bucket.listingCalls()).toBe(1);
    // The locally reserved name is kept, and the upload still runs.
    expect([...bucket.objects.keys()]).toEqual(['photos/a.jpg']);
  });

  it('tells the user the bucket could not be checked', async () => {
    bucket.failListings(new Error('CORS rejection'));
    const dispatch = mountPipeline();

    await act(async () => {
      await dispatch.current(await dropOfFolder('photos', [{ path: 'a.jpg' }]), '', bucket.apiS3);
    });
    await settle();

    expect(queue().notices.map((n) => n.kind)).toEqual(['unverified']);
    // Never "renamed" - nothing was renamed, and claiming otherwise would be a
    // fabricated conflict.
    expect(queue().notices.every((n) => n.kind !== 'renamed')).toBe(true);

    render(<QueueNotices />);
    expect(screen.getByText('Not verified')).toBeTruthy();
    expect(screen.getByText(/will be overwritten/)).toBeTruthy();
  });

  it('costs one check per folder across a whole drop', async () => {
    bucket.failListings(new Error('ERR_INTERNET_DISCONNECTED'));
    const a = await dropOfFolder('a', [{ path: 'x.jpg' }]);
    const b = await dropOfFolder('b', [{ path: 'y.jpg' }]);
    const c = await dropOfFolder('c', [{ path: 'z.jpg' }]);
    const dispatch = mountPipeline();

    await act(async () => {
      await dispatch.current(
        {
          individualFiles: [],
          folderStructures: [...a.folderStructures, ...b.folderStructures, ...c.folderStructures],
          skipped: [],
        },
        '',
        bucket.apiS3
      );
    });
    await settle();

    expect(bucket.listingCalls()).toBe(3);
    expect([...bucket.objects.keys()].sort()).toEqual(['a/x.jpg', 'b/y.jpg', 'c/z.jpg']);
  });
});
