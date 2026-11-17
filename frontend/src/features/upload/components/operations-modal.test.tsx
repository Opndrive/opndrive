/**
 * OperationsModal: the panel's own wiring, between a row's buttons and the
 * upload manager. The rows and the manager are tested on their own; this is
 * the part in between, where a button can reach the wrong thing or nothing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const manager = vi.hoisted(() => ({
  retryUpload: vi.fn((_id: string) => true),
  cancelUpload: vi.fn(),
  pauseUpload: vi.fn(),
  resumeUpload: vi.fn(),
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

import { OperationsModal, summariseFolder } from './operations-modal';
import { useUploadStore } from '../stores/use-upload-store';
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

    expect(manager.retryUpload).toHaveBeenCalledExactlyOnceWith('u1');
    // The reason described the attempt being replaced.
    expect(useUploadStore.getState().uploads.u1!.error).toBeUndefined();
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

    fireEvent.click(screen.getByRole('button', { name: 'Retry photos' }));

    // a.jpg already landed. Sending it again would only cost a request.
    expect(manager.retryUpload.mock.calls.map(([id]) => id)).toEqual(['b', 'c']);
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
