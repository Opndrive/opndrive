/**
 * Keyboard access for file and folder rows.
 *
 * The rows used to be plain divs with onClick and onDoubleClick, so the file
 * browser - the core interaction of the app - could not be reached or opened
 * with a keyboard at all. These tests go through the accessible role and name
 * a keyboard user actually lands on, so removing the role, the tabIndex or the
 * key handler fails here rather than silently shipping.
 *
 * All five row components carry their own copy of the handler, so all five are
 * covered here. They started as copies of each other and drift is the likely
 * way this regresses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FolderItem } from './folder-item';
import { FolderItemMobile } from './folder-item-mobile';
import { FileItemList } from './file-item-list';
import { FileItemGrid } from './file-item-grid';
import { FileItemMobile } from './file-item-mobile';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';
import type { Folder } from '@/features/dashboard/types/folder';
import type { FileItem } from '@/features/dashboard/types/file';

// The overflow menus pull in the rename, drive and router contexts, and the
// grid thumbnail wants an authenticated S3 client. None of that is what this
// file is about.
//
// The menus own their trigger button now, so these render it rather than
// nothing - otherwise the button these tests fire keys at would not exist.
vi.mock('../menus/folder-overflow-menu', () => ({
  FolderOverflowMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock('../menus/file-overflow-menu', () => ({
  FileOverflowMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock('./file-thumbnail-with-image', () => ({ FileThumbnailWithImage: () => null }));

const { openFilePreview, openPreview } = vi.hoisted(() => ({
  openFilePreview: vi.fn(),
  openPreview: vi.fn(),
}));
vi.mock('@/hooks/use-file-preview-actions', () => ({
  useFilePreviewActions: () => ({ openFilePreview }),
}));
vi.mock('@/context/file-preview-context', () => ({
  useFilePreview: () => ({ openPreview }),
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
  openPreview.mockClear();
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

  it('extends the selection with Shift the way Shift+Click does', () => {
    const folders = [folder(), folder({ id: 'taxes', name: 'Taxes', Prefix: 'taxes/' })];
    render(
      <>
        <FolderItem folder={folders[0]} index={0} allFolders={folders} />
        <FolderItem folder={folders[1]} index={1} allFolders={folders} />
      </>
    );

    // Ctrl first to drop the anchor, then Shift to reach across
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reports, folder' }), {
      key: 'Enter',
      ctrlKey: true,
    });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Taxes, folder' }), {
      key: 'Enter',
      shiftKey: true,
    });

    expect(selection()).toHaveLength(2);
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

  it('does not navigate again while Enter is held down', () => {
    const onClick = vi.fn();
    render(<FolderItem folder={folder()} onClick={onClick} />);
    const row = screen.getByRole('button', { name: 'Reports, folder' });

    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: 'Enter', repeat: true });
    fireEvent.keyDown(row, { key: 'Enter', repeat: true });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('leaves Alt combinations to the operating system', () => {
    const onClick = vi.fn();
    render(<FolderItem folder={folder()} onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reports, folder' }), {
      key: ' ',
      altKey: true,
    });

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

  it('does not open the file when the overflow menu is opened with a key', () => {
    render(<FileItemList file={file()} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions for budget.xlsx' }), {
      key: 'Enter',
    });

    expect(openFilePreview).not.toHaveBeenCalled();
  });
});

describe('grid tiles', () => {
  it('opens the preview on Enter', () => {
    const files = [file()];
    render(<FileItemGrid file={file()} allFiles={files} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'budget.xlsx, file' }), { key: 'Enter' });

    expect(openFilePreview).toHaveBeenCalledWith(file(), files);
  });

  it('selects instead of opening when Ctrl is held', () => {
    render(<FileItemGrid file={file()} allFiles={[file()]} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'budget.xlsx, file' }), {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(openFilePreview).not.toHaveBeenCalled();
    expect(selection()).toHaveLength(1);
  });

  it('does not open the file when the overflow menu is opened with a key', () => {
    // The menu lives inside the tile here, so its key events reach the tile
    render(<FileItemGrid file={file()} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions for budget.xlsx' }), {
      key: 'Enter',
    });

    expect(openFilePreview).not.toHaveBeenCalled();
  });
});

describe('mobile rows', () => {
  it('opens the folder on Enter', () => {
    const onFolderClick = vi.fn();
    render(<FolderItemMobile folder={folder()} onFolderClick={onFolderClick} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reports, folder' }), { key: 'Enter' });

    expect(onFolderClick).toHaveBeenCalledWith(folder());
  });

  it('adds to an existing selection rather than opening, the way a tap does', () => {
    const onFolderClick = vi.fn();
    const folders = [folder(), folder({ id: 'taxes', name: 'Taxes', Prefix: 'taxes/' })];
    render(
      <>
        <FolderItemMobile folder={folders[0]} index={0} allFolders={folders} />
        <FolderItemMobile
          folder={folders[1]}
          index={1}
          allFolders={folders}
          onFolderClick={onFolderClick}
        />
      </>
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Reports, folder' }), {
      key: 'Enter',
      ctrlKey: true,
    });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Taxes, folder' }), { key: 'Enter' });

    expect(onFolderClick).not.toHaveBeenCalled();
    expect(selection()).toHaveLength(2);
  });

  it('opens the file preview on Enter', () => {
    render(<FileItemMobile file={file()} allFiles={[file()]} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'budget.xlsx, file' }), { key: 'Enter' });

    expect(openPreview).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'budget.xlsx' }),
      expect.arrayContaining([expect.objectContaining({ name: 'budget.xlsx' })])
    );
  });

  it('selects the file instead of opening it when Ctrl is held', () => {
    render(<FileItemMobile file={file()} allFiles={[file()]} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'budget.xlsx, file' }), {
      key: 'Enter',
      ctrlKey: true,
    });

    expect(openPreview).not.toHaveBeenCalled();
    expect(selection()).toHaveLength(1);
  });
});
