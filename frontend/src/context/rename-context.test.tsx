/**
 * RenameProvider, when it cannot tell whether the new name is taken.
 *
 * Two things went wrong here together. The file check read a failed lookup as
 * "the name is free", so the rename copied over whatever was there. And when
 * a check did fail - the folder one always threw - the provider logged it and
 * nothing else, so pressing Rename appeared to do nothing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type React from 'react';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';

const notify = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }));
const api = vi.hoisted(() => ({
  objectExists: vi.fn(),
  fetchDirectoryStructure: vi.fn(),
  moveFile: vi.fn(async () => {}),
  renameFolder: vi.fn(),
}));

vi.mock('@/context/notification-context', () => ({ useNotification: () => notify }));
vi.mock('@/hooks/use-auth-guard', () => ({
  useAuthGuard: () => ({ apiS3: api, isLoading: false, isAuthenticated: true }),
}));

import { RenameProvider, useRename } from './rename-context';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <RenameProvider>{children}</RenameProvider>
);

const file = {
  id: 'docs/a.md',
  Key: 'docs/a.md',
  name: 'a.md',
  extension: 'md',
  size: { value: 1, unit: 'KB' },
} as FileItem;
const folder = { id: 'docs/photos/', Prefix: 'docs/photos/', name: 'photos' } as Folder;

const offline = () => Object.assign(new Error('Failed to fetch'), { name: 'TypeError' }) as Error;

beforeEach(() => {
  vi.clearAllMocks();
  // The provider logs what it reports; the report is what is checked here.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('a rename whose name could not be checked', () => {
  it('leaves the file where it is and says why', async () => {
    api.objectExists.mockRejectedValue(offline());
    const { result } = renderHook(() => useRename(), { wrapper });

    act(() => result.current.showRenameDialog(file, 'file', 'docs/'));
    await act(async () => {
      await result.current.handleRenameConfirm('b.md');
    });

    expect(api.moveFile).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith(
      expect.stringMatching(/Could not check whether that name is already taken/)
    );
    // Still open, so trying again is one click.
    expect(result.current.renameDialog.isOpen).toBe(true);
  });

  it('says why for a folder too, where it used to stay silent', async () => {
    api.fetchDirectoryStructure.mockRejectedValue(offline());
    const { result } = renderHook(() => useRename(), { wrapper });

    act(() => result.current.showRenameDialog(folder, 'folder', 'docs/'));
    await act(async () => {
      await result.current.handleRenameConfirm('pictures');
    });

    expect(api.renameFolder).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith(
      expect.stringMatching(/Could not check whether that name is already taken/)
    );
  });

  it('goes ahead when the name is definitely free', async () => {
    api.objectExists.mockResolvedValue(false);
    const { result } = renderHook(() => useRename(), { wrapper });

    act(() => result.current.showRenameDialog(file, 'file', 'docs/'));
    await act(async () => {
      await result.current.handleRenameConfirm('b.md');
    });

    expect(api.moveFile).toHaveBeenCalledWith({ oldKey: 'docs/a.md', newKey: 'docs/b.md' });
    expect(notify.error).not.toHaveBeenCalled();
  });
});

describe('a folder renamed from search results', () => {
  // Search lists folders from anywhere in the bucket while the drive is still
  // at the root. The rename and its duplicate check used the folder being
  // browsed as the parent, so "a/b/photos/" renamed from the root went to
  // "pictures/" at the root.
  it('is checked and renamed where it is, not where the user is browsing', async () => {
    api.fetchDirectoryStructure.mockResolvedValue({ files: [], folders: [] });
    const deep = { id: 'a/b/photos/', Prefix: 'a/b/photos/', name: 'photos' } as Folder;
    const { result } = renderHook(() => useRename(), { wrapper });

    act(() => result.current.showRenameDialog(deep, 'folder', ''));
    await act(async () => {
      await result.current.handleRenameConfirm('pictures');
    });

    expect(api.fetchDirectoryStructure).toHaveBeenCalledWith('a/b/pictures/', 1);
    expect(api.renameFolder).toHaveBeenCalledWith({
      oldPrefix: 'a/b/photos/',
      newPrefix: 'a/b/pictures/',
    });
  });
});
