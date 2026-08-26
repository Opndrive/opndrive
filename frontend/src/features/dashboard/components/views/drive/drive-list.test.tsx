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

/**
 * The drag state the dashboard layout normally supplies.
 *
 * Both rows and the listing read it, so the mock has to return the real shape:
 * a mock returning fields that no longer exist reads as `undefined` everywhere,
 * which is indistinguishable from "no drag" - the overlay and the folder
 * highlight could stop working entirely and every case here would still pass.
 */
const { drag } = vi.hoisted(() => ({
  drag: { isFileDragActive: false, hoveredTargetId: null as string | null },
}));

vi.mock('@/features/upload/providers/enhanced-drag-drop-provider', () => ({
  useEnhancedDragDrop: () => drag,
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
  drag.isFileDragActive = false;
  drag.hoveredTargetId = null;
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
    render(
      <DriveList
        folders={[folder(), folder({ id: 'tax', name: 'Taxes', Prefix: 'taxes/' })]}
        files={[]}
      />
    );

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

/**
 * The list view renders one tree per breakpoint and shows whichever the CSS
 * allows. Handing the folder rows to the desktop tree alone made them vanish
 * below `sm`, and on a prefix holding only folders it left the page blank -
 * the empty-state drop zone having been suppressed by then too.
 */
describe('the mobile tree lists the folders as well', () => {
  it('renders each folder in both trees, not just the desktop one', () => {
    render(<DriveList folders={[folder()]} files={[file()]} />);

    // One row per breakpoint tree. Before the fix the folder appeared once,
    // in the desktop tree, and was invisible on a phone.
    expect(screen.getAllByText('Reports')).toHaveLength(2);
  });

  it('does not head the mobile list "Files" when folders open it', () => {
    render(<DriveList folders={[folder()]} files={[file()]} />);

    expect(screen.queryAllByText('Files')).toHaveLength(0);
  });
});

/**
 * Both dashboard pages clear the selection on any mousedown that misses a row,
 * testing for these attributes. A folder row without one cleared the selection
 * it had just made.
 */
describe('folder rows are recognised by the click-outside handler', () => {
  it('marks itself as a folder item', () => {
    const { container } = render(<DriveList folders={[folder()]} files={[]} />);

    expect(container.querySelector('[data-folder-item]')).not.toBeNull();
  });
});

/**
 * A folder has no date to show, and never will.
 *
 * A delimited S3 listing returns folders as CommonPrefixes, which carry the
 * prefix string and no metadata at all, so there is nothing to read even where
 * a folder marker object exists. The three surfaces used to disagree about how
 * to say so: the table drew a blank cell, the mobile row printed "No date", and
 * the grid card dropped the line.
 */
describe('every dash explains itself the same way', () => {
  it('shows one in each column a folder cannot fill', () => {
    render(<DriveList folders={[folder()]} files={[]} />);

    // Date and size. Both absent for a folder, both marked the same way.
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  /**
   * The regression this guards: the size cell was a bare dash whose reasoning
   * lived only in a code comment, while the date cell explained itself on
   * hover. Same character, same meaning, two behaviours - and a reader hovering
   * the one that stayed silent learns nothing.
   */
  it('gives every dash a reason, not just the date', () => {
    const { container } = render(<DriveList folders={[folder()]} files={[]} />);

    const dashes = Array.from(container.querySelectorAll('span[title]')).filter((el) =>
      el.textContent?.includes('—')
    );

    expect(dashes).toHaveLength(2);
    dashes.forEach((el) => expect(el.getAttribute('title')).toBeTruthy());
  });

  it('says why rather than just that', () => {
    const { container } = render(<DriveList folders={[folder()]} files={[]} />);
    const titles = Array.from(container.querySelectorAll('span[title]')).map((el) =>
      el.getAttribute('title')
    );

    expect(titles).toContain('This listing carries no date for it.');
    expect(titles).toContain('Folders have no size of their own, and S3 does not report one.');
  });

  /**
   * A lone em dash is announced as punctuation or skipped, and `title` is not
   * reliably announced at all, so the reason is in the accessibility tree as
   * text - without either span becoming a tab stop, which in a long listing
   * would put two of them in every row.
   */
  it('reads the reason to a screen reader and hides the dash from it', () => {
    const { container } = render(<DriveList folders={[folder()]} files={[]} />);

    expect(container.querySelectorAll('[aria-hidden="true"].sr-only')).toHaveLength(0);
    expect(container.querySelectorAll('span.sr-only').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('span[title][tabindex]')).toHaveLength(0);
  });

  it('never says "No date"', () => {
    render(<DriveList folders={[folder()]} files={[]} />);

    expect(screen.queryAllByText('No date')).toHaveLength(0);
  });
});

/**
 * What the old mock hid.
 *
 * It returned the drag API as it was before the rewrite, so every component
 * here read `undefined` for the two fields they actually use - which looks
 * exactly like "no drag in progress". The overlay and the folder highlight
 * could have stopped working outright and every case above would still pass.
 */
describe('folder rows as drop targets', () => {
  it('marks a folder so the drag provider can find it', () => {
    const { container } = render(
      <DriveList folders={[folder()]} files={[file()]} onFilesDroppedToFolder={vi.fn()} />
    );

    // The list renders a tree per breakpoint and shows one, so the row is
    // marked twice - whichever is on screen has to be findable.
    expect(container.querySelectorAll('[data-drop-target-id="folder-reports/"]')).toHaveLength(2);
  });

  it('leaves a folder unmarked when nothing handles its drops', () => {
    const { container } = render(<DriveList folders={[folder()]} files={[file()]} />);

    // Unmarked means the hit-test walks past to the listing, which uploads to
    // the current prefix. Standing a no-op in - what this used to pass - left
    // the row claiming the drop and then discarding it.
    expect(container.querySelector('[data-drop-target-id]')).toBeNull();
  });

  it('highlights the folder the pointer is over', () => {
    drag.isFileDragActive = true;
    drag.hoveredTargetId = 'folder-reports/';

    const { container } = render(
      <DriveList folders={[folder()]} files={[file()]} onFilesDroppedToFolder={vi.fn()} />
    );

    const row = container.querySelector('[data-drop-target-id="folder-reports/"]')!;
    expect(row.querySelector('[class*="bg-primary/10"]')).not.toBeNull();
  });

  it('leaves every other folder alone', () => {
    drag.isFileDragActive = true;
    drag.hoveredTargetId = 'folder-taxes/';

    const { container } = render(
      <DriveList
        folders={[folder(), folder({ id: 'tax', name: 'Taxes', Prefix: 'taxes/' })]}
        files={[]}
        onFilesDroppedToFolder={vi.fn()}
      />
    );

    const reports = container.querySelector('[data-drop-target-id="folder-reports/"]')!;
    expect(reports.querySelector('[class*="bg-primary/10"]')).toBeNull();
  });
});

describe('the listing offers itself as a drop target', () => {
  it('outlines itself while files are being dragged', () => {
    drag.isFileDragActive = true;

    const { container } = render(<DriveList folders={[folder()]} files={[file()]} />);

    expect(container.querySelector('[class*="border-dashed"]')).not.toBeNull();
  });

  it('steps back while a folder is claiming the drop', () => {
    drag.isFileDragActive = true;
    drag.hoveredTargetId = 'folder-reports/';

    const { container } = render(
      <DriveList folders={[folder()]} files={[file()]} onFilesDroppedToFolder={vi.fn()} />
    );

    // Otherwise the table and the row both advertise themselves, giving two
    // answers to the one question of where the files are about to land.
    expect(container.querySelector('[class*="border-dashed"]')).toBeNull();
  });

  it('draws nothing with no drag in progress', () => {
    const { container } = render(<DriveList folders={[folder()]} files={[file()]} />);

    expect(container.querySelector('[class*="border-dashed"]')).toBeNull();
  });
});

describe('the layout control stays reachable', () => {
  it('survives a directory with nothing in it', () => {
    // The empty-state branch rendered no toggle at all, so opening an empty
    // folder in grid view left no way back to list until you navigated away.
    render(<DriveList folders={[]} files={[]} />);

    // List and grid: the only two buttons an empty directory has.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
