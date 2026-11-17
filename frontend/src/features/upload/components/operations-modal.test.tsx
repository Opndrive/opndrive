/**
 * OperationsModal: the panel's own wiring, between a row's buttons and the
 * upload manager and executor. Those and the rows are tested on their own;
 * this is the part in between, where a button can reach the wrong thing or
 * nothing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RetryOutcome } from '../services/upload-executor';

const { manager, executor } = vi.hoisted(() => ({
  manager: {
    retryUpload: vi.fn((_id: string) => true),
    cancelUpload: vi.fn(),
    pauseUpload: vi.fn(),
    resumeUpload: vi.fn(),
  },
  executor: {
    retry: vi.fn((_id: string): RetryOutcome => ({ ok: true })),
    uploadsFor: vi.fn((_taskId: string): string[] => []),
    cancelTask: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard',
}));

// Only the manager is replaced. Everything else in the module is real, and
// with no provider around it reads the empty session context's defaults.
vi.mock('@/hooks/use-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-auth')>()),
  useActiveUploadManager: () => manager,
}));

vi.mock('../context/upload-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../context/upload-context')>()),
  useUploadExecutor: () => executor,
}));

import { OperationsModal, summariseFolder } from './operations-modal';
import { useUploadStore } from '../stores/use-upload-store';
import { useUploadQueueStore } from '../stores/use-upload-queue-store';
import { NotificationProvider } from '@/context/notification-context';

type Uploads = ReturnType<typeof useUploadStore.getState>['uploads'];

const renderPanel = () =>
  render(
    <NotificationProvider>
      <OperationsModal />
    </NotificationProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  useUploadStore.setState({ uploads: {}, deletes: {}, duplicateQueue: [] });
  useUploadQueueStore.setState({ preparingDrops: 0, readingDrops: 0, filesFound: 0, notices: [] });
});

function seed(uploads: Uploads) {
  useUploadStore.setState({ uploads });
}

describe('Retry', () => {
  it('sends a failed file again, and clears the reason it failed', () => {
    seed({
      u1: {
        id: 'u1',
        name: 'report.pdf',
        type: 'file',
        status: 'failed',
        progress: 40,
        error: 'Access Denied',
      },
    });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Retry report.pdf' }));

    // Through the executor, which keeps the task's books, not around it.
    expect(executor.retry).toHaveBeenCalledExactlyOnceWith('u1');
    expect(manager.retryUpload).not.toHaveBeenCalled();
    // The reason described the attempt being replaced.
    expect(useUploadStore.getState().uploads.u1!.error).toBeUndefined();
  });

  it('says why, on the card, when a retry is refused', () => {
    executor.retry.mockReturnValueOnce({ ok: false, reason: 'The name is taken now.' });
    seed({
      u1: { id: 'u1', name: 'report.pdf', type: 'file', status: 'failed', progress: 0 },
    });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Retry report.pdf' }));

    expect(useUploadStore.getState().uploads.u1!.error).toBe('The name is taken now.');
  });

  it('retries only the files of a folder that failed', () => {
    seed({
      folder: {
        id: 'folder',
        name: 'photos',
        type: 'folder',
        status: 'queued',
        progress: 0,
        fileIds: ['a', 'b', 'c'],
      },
      a: {
        id: 'a',
        name: 'photos/a.jpg',
        type: 'file',
        status: 'completed',
        progress: 100,
        parentFolderId: 'folder',
      },
      b: {
        id: 'b',
        name: 'photos/b.jpg',
        type: 'file',
        status: 'failed',
        progress: 0,
        parentFolderId: 'folder',
      },
      c: {
        id: 'c',
        name: 'photos/c.jpg',
        type: 'file',
        status: 'failed',
        progress: 0,
        parentFolderId: 'folder',
      },
    });
    renderPanel();

    const updates = vi.fn();
    const unsubscribe = useUploadStore.subscribe(updates);
    fireEvent.click(screen.getByRole('button', { name: 'Retry photos' }));
    unsubscribe();

    // a.jpg already landed. Sending it again would only cost a request.
    expect(executor.retry.mock.calls.map(([id]) => id)).toEqual(['b', 'c']);
    // One update for the whole folder: each one copies every card.
    expect(updates).toHaveBeenCalledTimes(1);
  });

  it("puts a folder's refusal on the folder, and takes it off once a retry gets through", () => {
    executor.retry.mockReturnValue({ ok: false, reason: 'The name is taken now.' });
    seed({
      folder: {
        id: 'folder',
        name: 'photos',
        type: 'folder',
        status: 'queued',
        progress: 0,
        fileIds: ['a'],
      },
      a: {
        id: 'a',
        name: 'photos/a.jpg',
        type: 'file',
        status: 'failed',
        progress: 0,
        parentFolderId: 'folder',
      },
    });
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Retry photos' }));
    expect(useUploadStore.getState().uploads.folder!.error).toBe('The name is taken now.');
    expect(screen.getByText('The name is taken now.')).toBeTruthy();

    executor.retry.mockReturnValue({ ok: true });
    fireEvent.click(screen.getByRole('button', { name: 'Retry photos' }));
    expect(useUploadStore.getState().uploads.folder!.error).toBeUndefined();
  });
});

describe('a failed upload', () => {
  it('says why it failed', () => {
    seed({
      u1: {
        id: 'u1',
        name: 'report.pdf',
        type: 'file',
        status: 'failed',
        progress: 40,
        error: 'Access Denied',
      },
    });
    renderPanel();

    // Not a bare "Failed": a refused key and a dropped connection want
    // different things from the person reading it.
    expect(screen.getByText('Access Denied')).toBeTruthy();
  });

  it('says why a folder failed, from the file that failed', () => {
    seed({
      folder: {
        id: 'folder',
        name: 'photos',
        type: 'folder',
        status: 'queued',
        progress: 0,
        fileIds: ['a', 'b'],
      },
      a: {
        id: 'a',
        name: 'photos/a.jpg',
        type: 'file',
        status: 'completed',
        progress: 100,
        parentFolderId: 'folder',
      },
      b: {
        id: 'b',
        name: 'photos/b.jpg',
        type: 'file',
        status: 'failed',
        progress: 0,
        parentFolderId: 'folder',
        error: 'The specified bucket does not exist',
      },
    });
    renderPanel();

    expect(screen.getByText('The specified bucket does not exist')).toBeTruthy();
  });

  it("prefers the folder's own reason, when it has one", () => {
    seed({
      folder: {
        id: 'folder',
        name: 'photos',
        type: 'folder',
        status: 'failed',
        progress: 0,
        error: 'The upload could not start.',
      },
    });
    renderPanel();

    expect(screen.getByText('The upload could not start.')).toBeTruthy();
  });
});

describe('while a drop is being prepared', () => {
  // Between a drop landing and its first card, a big folder is read, checked
  // and planned. The panel used to stay away for all of it.
  it('shows the panel, and how many files have been found so far', () => {
    useUploadQueueStore.setState({ preparingDrops: 1, readingDrops: 1, filesFound: 1234 });
    renderPanel();

    expect(screen.getByText('Preparing upload')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Reading dropped files… 1,234 found');
  });

  it('says it is getting ready once reading is done and checking has begun', () => {
    useUploadQueueStore.setState({ preparingDrops: 1, readingDrops: 0, filesFound: 0 });
    renderPanel();

    expect(screen.getByRole('status').textContent).toBe('Getting ready to upload…');
  });

  it('shows the line alongside cards already in the panel', () => {
    seed({
      u1: { id: 'u1', name: 'old.pdf', type: 'file', status: 'uploading', progress: 50 },
    });
    useUploadQueueStore.setState({ preparingDrops: 1, readingDrops: 1, filesFound: 0 });
    renderPanel();

    expect(screen.getByRole('status').textContent).toBe('Reading dropped files…');
  });

  it('goes away once there is nothing to prepare and nothing to show', () => {
    const { container } = renderPanel();

    expect(container.textContent).toBe('');
  });
});

/**
 * A folder card's status and progress, from its files.
 *
 * Rewritten as a single pass for speed, so each rule the old multi-pass
 * version had is pinned here, in its order of precedence.
 */
describe('summariseFolder', () => {
  type Status = Uploads[string]['status'];

  function folderOf(statuses: Status[], { folderStatus = 'queued' as Status, progress = 0 } = {}) {
    const ids = statuses.map((_, i) => `f${i}`);
    const uploads: Uploads = {
      folder: {
        id: 'folder',
        name: 'photos',
        type: 'folder',
        status: folderStatus,
        progress: 0,
        fileIds: ids,
      },
    };
    statuses.forEach((status, i) => {
      uploads[ids[i]!] = {
        id: ids[i]!,
        name: `photos/${i}.jpg`,
        type: 'file',
        status,
        progress,
        parentFolderId: 'folder',
      };
    });
    return uploads;
  }

  it.each<[string, Status[], string]>([
    ['uploading while any file is', ['completed', 'uploading', 'failed', 'paused'], 'uploading'],
    ['paused while any file is and none is uploading', ['completed', 'paused', 'queued'], 'paused'],
    ['completed once every file is', ['completed', 'completed'], 'completed'],
    ['uploading while some are done and some still wait', ['completed', 'queued'], 'uploading'],
    ['failed when something failed and nothing is left to run', ['completed', 'failed'], 'failed'],
    ['failed when nothing finished and something failed', ['queued', 'failed'], 'failed'],
    ['queued while every file waits', ['queued', 'queued'], 'queued'],
    ['queued when every file was cancelled', ['cancelled', 'cancelled'], 'queued'],
  ])('is %s', (_, statuses, expected) => {
    expect(summariseFolder(folderOf(statuses), 'folder').status).toBe(expected);
  });

  it('is cancelled when the folder itself was, whatever its files say', () => {
    const uploads = folderOf(['uploading', 'completed'], { folderStatus: 'cancelled' });

    expect(summariseFolder(uploads, 'folder').status).toBe('cancelled');
  });

  it('averages progress over every file, counting a missing card as nothing done', () => {
    const uploads = folderOf(['uploading', 'uploading'], { progress: 50 });
    uploads.folder!.fileIds = ['f0', 'f1', 'gone', 'gone-too'];

    // (50 + 50 + 0 + 0) / 4. The missing ones still count towards the total.
    expect(summariseFolder(uploads, 'folder').progress).toBe(25);
    // But not towards the status: the two present files are both uploading.
    expect(summariseFolder(uploads, 'folder').status).toBe('uploading');
  });

  it('reports no progress, not NaN, for a folder with no files', () => {
    expect(summariseFolder(folderOf([]), 'folder')).toEqual({ status: 'queued', progress: 0 });
  });

  it("falls back to the card's own status when it lists no files", () => {
    const uploads = folderOf([], { folderStatus: 'failed' });
    delete uploads.folder!.fileIds;

    expect(summariseFolder(uploads, 'folder')).toEqual({ status: 'failed', progress: 0 });
  });
});
