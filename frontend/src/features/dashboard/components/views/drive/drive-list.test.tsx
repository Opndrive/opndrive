/**
 * My Drive shows one directory, not two lists of it.
 *
 * The drive views were written for Home and reused wholesale, so a folder
 * listing rendered as a block of folder cards with its own heading sitting
 * above a file table with its own heading. Home wants that shape, because it
 * lists recent activity of two different kinds. A directory does not: the
 * folders and the files in it are one thing, and Drive shows them as one.
 *
 * List view is therefore one table. Grid view keeps the two sections, because
 * folder cards and file cards are different shapes and interleaving them
 * leaves a ragged grid for no gain.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DriveList } from './drive-list';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';
import type { Folder } from '@/features/dashboard/types/folder';
import type { FileItem } from '@/features/dashboard/types/file';

let layout: 'list' | 'grid' = 'list';

vi.mock('@/hooks/use-current-layout', () => ({
  useCurrentLayout: () => ({
    layout,
    isLoaded: true,
    isListView: layout === 'list',
    isGridView: layout === 'grid',
  }),
}));

vi.mock('../../ui/menus/folder-overflow-menu', () => ({
  FolderOverflowMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock('../../ui/menus/file-overflow-menu', () => ({
  FileOverflowMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock('../../ui/items/file-thumbnail-with-image', () => ({
  FileThumbnailWithImage: () => null,
}));
vi.mock('@/hooks/use-file-preview-actions', () => ({
  useFilePreviewActions: () => ({ openFilePreview: vi.fn() }),
}));
vi.mock('@/context/file-preview-context', () => ({
  useFilePreview: () => ({ openPreview: vi.fn() }),
}));

// Grid view's folder cards register themselves as drop targets, which needs the
// provider the dashboard layout supplies. Nothing here drags anything.
vi.mock('@/features/upload/providers/enhanced-drag-drop-provider', () => ({
  useEnhancedDragDrop: () => ({
    isActive: false,
    source: null,
    canDrop: false,
    registerDropTarget: vi.fn(),
    unregisterDropTarget: vi.fn(),
    setDragSource: vi.fn(),
    setHoverTarget: vi.fn(),
    getTargetState: () => ({ isHovered: false, canAcceptDrop: false, isDraggedOver: false }),
  }),
}));

function folder(over: Partial<Folder> = {}): Folder {
  return {
    id: 'reports',
    name: 'Reports',
    Prefix: 'reports/',
    icon: 'folder',
    location: { type: 'my-drive', label: 'My Drive' },
    ...over,
  } as Folder;
}

function file(over: Partial<FileItem> = {}): FileItem {
  return {
    id: 'budget',
    name: 'budget.xlsx',
    Key: 'budget.xlsx',
    extension: 'xlsx',
    size: { value: 12, unit: 'KB' },
    lastModified: new Date('2026-08-01'),
    ...over,
  } as FileItem;
}

beforeEach(() => {
  layout = 'list';
  useMultiSelectStore.getState().clearSelection();
});

describe('list view is one table', () => {
  it('shows folders and files together', () => {
    render(<DriveList folders={[folder()]} files={[file()]} />);

    expect(screen.getAllByText('Reports').length).toBeGreaterThan(0);
    expect(screen.getAllByText('budget.xlsx').length).toBeGreaterThan(0);
  });

  it('does not head the table with a section name', () => {
    // "Files" over a list that opens with folders would be a lie, and the page
    // is already titled.
    render(<DriveList folders={[folder()]} files={[file()]} />);

    expect(screen.queryByText('Suggested files')).toBeNull();
    expect(screen.queryByText('Suggested Folders')).toBeNull();
  });

  /**
   * The bug this guards, and the one that made the browse page render blank:
   * the file table returned its empty-state drop zone whenever `files` was
   * empty, before the folder rows handed to it had a chance to render. Any
   * prefix holding only folders - the top of most buckets - drew as an empty
   * directory.
   */
  it('shows folders in a directory that has no files', () => {
    render(<DriveList folders={[folder(), folder({ id: 'tax', name: 'Taxes' })]} files={[]} />);

    expect(screen.getAllByText('Reports').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Taxes').length).toBeGreaterThan(0);
  });

  it('still shows the drop zone when the directory is genuinely empty', () => {
    const { container } = render(<DriveList folders={[]} files={[]} />);

    expect(screen.queryAllByText('Reports')).toHaveLength(0);
    expect(container.textContent).not.toContain('budget.xlsx');
  });
});

describe('grid view keeps the two sections', () => {
  beforeEach(() => {
    layout = 'grid';
  });

  it('names them for the directory rather than for Home', () => {
    render(<DriveList folders={[folder()]} files={[file()]} />);

    // Nothing in a bucket listing is a suggestion.
    expect(screen.getByText('Folders')).toBeDefined();
    expect(screen.queryByText('Suggested Folders')).toBeNull();
  });

  it('still shows both kinds', () => {
    render(<DriveList folders={[folder()]} files={[file()]} />);

    expect(screen.getAllByText('Reports').length).toBeGreaterThan(0);
    expect(screen.getAllByText('budget.xlsx').length).toBeGreaterThan(0);
  });
});
