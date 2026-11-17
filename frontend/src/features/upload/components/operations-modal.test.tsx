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

import { OperationsModal } from './operations-modal';
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
