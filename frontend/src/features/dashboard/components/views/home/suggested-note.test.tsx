/**
 * Home's suggestions are drawn from what has been read of the folder, never a
 * separate copy of it. When that is not the whole folder, the sections say so.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SuggestedFiles } from './suggested-files';
import { SuggestedFolders } from './suggested-folders';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';

vi.mock('@/hooks/use-current-layout', () => ({
  useCurrentLayout: () => ({ layout: 'list', isLoaded: true, isListView: true, isGridView: false }),
}));
vi.mock('../../ui/menus/folder-overflow-menu', () => ({
  FolderOverflowMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock('../../ui/menus/file-overflow-menu', () => ({
  FileOverflowMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock('@/hooks/use-file-preview-actions', () => ({
  useFilePreviewActions: () => ({ openFilePreview: vi.fn() }),
}));
vi.mock('@/context/file-preview-context', () => ({
  useFilePreview: () => ({ openPreview: vi.fn() }),
}));
vi.mock('@/features/upload/providers/enhanced-drag-drop-provider', () => ({
  useEnhancedDragDrop: () => ({ isFileDragActive: false, hoveredTargetId: null }),
}));

const file = {
  id: 'a.txt',
  Key: 'a.txt',
  name: 'a.txt',
  extension: 'txt',
  size: { value: 1, unit: 'KB' },
} as FileItem;
const folder = { id: 'd/', Prefix: 'd/', name: 'd', icon: 'folder' } as Folder;

describe('saying what the suggestions come from', () => {
  it('notes a partly read folder beside each heading', () => {
    render(
      <>
        <SuggestedFolders folders={[folder]} note="From the first 1,000 items" />
        <SuggestedFiles files={[file]} note="Recent among the first 1,000 items" />
      </>
    );

    expect(screen.getByText('From the first 1,000 items')).toBeDefined();
    expect(screen.getByText('Recent among the first 1,000 items')).toBeDefined();
  });

  it('keeps the note out of the heading button, which only folds the section', () => {
    render(<SuggestedFiles files={[file]} note="Recent among the first 1,000 items" />);

    expect(screen.getByRole('button', { name: /Suggested files/ }).textContent).not.toContain(
      'Recent among'
    );
  });

  it('says nothing extra for a complete folder', () => {
    render(<SuggestedFiles files={[file]} />);

    expect(screen.queryByText(/among the first/)).toBeNull();
  });
});
