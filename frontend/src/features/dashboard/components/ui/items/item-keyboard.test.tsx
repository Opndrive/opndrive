/**
 * Keyboard access for file and folder rows.
 *
 * The rows used to be plain divs with onClick and onDoubleClick, so the file
 * browser - the core interaction of the app - could not be reached or opened
 * with a keyboard at all. These tests go through the accessible role and name
 * a keyboard user actually lands on, so removing the role, the tabIndex or the
 * key handler fails here rather than silently shipping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FolderItem } from './folder-item';
import { FileItemList } from './file-item-list';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';
import type { Folder } from '@/features/dashboard/types/folder';
import type { FileItem } from '@/features/dashboard/types/file';

// The overflow menus pull in the rename, drive and router contexts, none of
// which this file is about.
vi.mock('../menus/folder-overflow-menu', () => ({ FolderOverflowMenu: () => null }));
vi.mock('../menus/file-overflow-menu', () => ({ FileOverflowMenu: () => null }));

const { openFilePreview } = vi.hoisted(() => ({ openFilePreview: vi.fn() }));
vi.mock('@/hooks/use-file-preview-actions', () => ({
  useFilePreviewActions: () => ({ openFilePreview }),
}));

function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'reports',
    name: 'Reports',
    Prefix: 'reports/',
    location: { type: 'my-drive', label: 'My Drive' },
    ...overrides,
  };
}

function file(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: 'budget',
    name: 'budget.xlsx',
    Key: 'reports/budget.xlsx',
    extension: 'xlsx',
    size: { value: 12, unit: 'KB' },
    ...overrides,
  };
}

const selection = () => useMultiSelectStore.getState().selectedItems;

beforeEach(() => {
  openFilePreview.mockClear();
});

describe('folder rows', () => {
  it('exposes the folder as a named, focusable button', () => {
    render(<FolderItem folder={folder()} />);

    const row = screen.getByRole('button', { name: 'Reports, folder' });
    expect(row).toHaveProperty('tabIndex', 0);
  });

  it('opens the folder on Enter', () => {
    const onClick = vi.fn();
    render(<FolderItem folder={folder()} onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reports, folder' }), { key: 'Enter' });

    expect(onClick).toHaveBeenCalledWith(folder());
  });

  it('opens the folder on Space', () => {
    const onClick = vi.fn();
    render(<FolderItem folder={folder()} onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reports, folder' }), { key: ' ' });

    expect(onClick).toHaveBeenCalledWith(folder());
  });

  it('selects instead of opening when Ctrl is held', () => {
    const onClick = vi.fn();
    render(<FolderItem folder={folder()} onClick={onClick} allFolders={[folder()]} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reports, folder' }), {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(onClick).not.toHaveBeenCalled();
    expect(selection()).toHaveLength(1);
  });

  it('reports the selection to screen readers', () => {
    render(<FolderItem folder={folder()} allFolders={[folder()]} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reports, folder' }), {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(screen.getByRole('button', { name: 'Reports, folder, selected' })).toBeDefined();
  });

  it('ignores keys that are not Enter or Space', () => {
    const onClick = vi.fn();
    render(<FolderItem folder={folder()} onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reports, folder' }), { key: 'a' });

    expect(onClick).not.toHaveBeenCalled();
    expect(selection()).toHaveLength(0);
  });

  it('does not open the folder when the overflow menu is opened with a key', () => {
    const onClick = vi.fn();
    render(<FolderItem folder={folder()} onClick={onClick} />);

    // Bubbles up to the row, which must ignore it
    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions for Reports' }), {
      key: 'Enter',
    });

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('file rows', () => {
  it('exposes the file as a named, focusable button', () => {
    render(<FileItemList file={file()} />);

    const row = screen.getByRole('button', { name: 'budget.xlsx, file' });
    expect(row).toHaveProperty('tabIndex', 0);
  });

  it('opens the preview on Enter', () => {
    const files = [file()];
    render(<FileItemList file={file()} allFiles={files} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'budget.xlsx, file' }), { key: 'Enter' });

    expect(openFilePreview).toHaveBeenCalledWith(file(), files);
  });

  it('opens the preview on Space', () => {
    render(<FileItemList file={file()} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'budget.xlsx, file' }), { key: ' ' });

    expect(openFilePreview).toHaveBeenCalled();
  });

  it('does not preview a key that is really a folder marker', () => {
    const marker = file({ name: 'archive', Key: 'reports/archive/' });
    render(<FileItemList file={marker} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'archive, file' }), { key: 'Enter' });

    expect(openFilePreview).not.toHaveBeenCalled();
  });

  it('selects instead of opening when Ctrl is held', () => {
    render(<FileItemList file={file()} allFiles={[file()]} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'budget.xlsx, file' }), {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(openFilePreview).not.toHaveBeenCalled();
    expect(selection()).toHaveLength(1);
  });
});
