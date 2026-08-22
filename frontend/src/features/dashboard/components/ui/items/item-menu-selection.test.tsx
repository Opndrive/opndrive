/**
 * Opening a row's overflow menu selects that row.
 *
 * It behaves like a plain click on the row: no ctrl or shift, so it replaces
 * whatever was selected before rather than adding to it. Multi-select stays a
 * keyboard gesture, so clicking the menu on a third folder while two are
 * selected leaves just the third one selected.
 *
 * Deliberately not on touch. There a tap opens an item and selection sits
 * behind a long press, and once anything is selected a tap selects instead of
 * opening - so selecting from the menu button would quietly change what every
 * later tap does.
 *
 * The selection runs on pointerdown rather than click, because that is when
 * Radix opens the menu. On click the multi-select bar trailed the menu by the
 * whole length of the press.
 *
 * All six row components carry their own copy of the handler, so all six are
 * covered. They started as copies of each other and drift is how this regresses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FolderItem } from './folder-item';
import { FolderItemMobile } from './folder-item-mobile';
import { FolderItemList } from './folder-item-list';
import { FileItemList } from './file-item-list';
import { FileItemGrid } from './file-item-grid';
import { FileItemMobile } from './file-item-mobile';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';
import type { Folder } from '@/features/dashboard/types/folder';
import type { FileItem } from '@/features/dashboard/types/file';

// The menus own their trigger button, so these render it rather than nothing.
vi.mock('../menus/folder-overflow-menu', () => ({
  FolderOverflowMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock('../menus/file-overflow-menu', () => ({
  FileOverflowMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock('./file-thumbnail-with-image', () => ({ FileThumbnailWithImage: () => null }));
vi.mock('@/hooks/use-file-preview-actions', () => ({
  useFilePreviewActions: () => ({ openFilePreview: vi.fn() }),
}));
vi.mock('@/context/file-preview-context', () => ({
  useFilePreview: () => ({ openPreview: vi.fn() }),
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
const menuButton = (name: string) =>
  screen.getByRole('button', { name: `More actions for ${name}` });

/**
 * Presses the menu button the way a mouse actually does.
 *
 * Selection hangs off pointerdown now, to fire at the same moment Radix opens
 * the menu. `fireEvent.click` alone dispatches no pointerdown, so it models a
 * press no real device performs - and would go on passing against code that had
 * lost the handler entirely.
 */
function pressMenu(button: HTMLElement, init: Partial<PointerEventInit> = {}) {
  fireEvent.pointerDown(button, { button: 0, ...init });
  fireEvent.click(button, init);
}

/** Makes the environment look like a mouse-driven one, or a touchscreen. */
function setPointer({ touch }: { touch: boolean }) {
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touch ? 5 : 0, configurable: true });
  if (touch) {
    (window as unknown as Record<string, unknown>).ontouchstart = null;
  } else {
    delete (window as unknown as Record<string, unknown>).ontouchstart;
  }
}

beforeEach(() => {
  useMultiSelectStore.getState().clearSelection();
  setPointer({ touch: false });
});

afterEach(() => {
  setPointer({ touch: false });
});

describe('a mouse click on the menu button selects the row', () => {
  it('selects a folder row', () => {
    render(<FolderItem folder={folder()} allFolders={[folder()]} />);

    pressMenu(menuButton('Reports'));

    expect(selection()).toHaveLength(1);
    expect(useMultiSelectStore.getState().selectedType).toBe('folder');
  });

  // The row form folders take in the unified list view. It carries its own copy
  // of the handler like the others, which is exactly why it is covered here.
  it('selects a folder row in the list layout', () => {
    render(<FolderItemList folder={folder()} allItems={[folder()]} />);

    pressMenu(menuButton('Reports'));

    expect(selection()).toHaveLength(1);
    expect(useMultiSelectStore.getState().selectedType).toBe('folder');
  });

  it('selects a folder row on mobile layout', () => {
    render(<FolderItemMobile folder={folder()} allFolders={[folder()]} />);

    pressMenu(menuButton('Reports'));

    expect(selection()).toHaveLength(1);
  });

  it.each([
    ['list', FileItemList],
    ['grid', FileItemGrid],
    ['mobile', FileItemMobile],
  ])('selects a file row in the %s layout', (_label, Component) => {
    render(<Component file={file()} allFiles={[file()]} />);

    pressMenu(menuButton('budget.xlsx'));

    expect(selection()).toHaveLength(1);
    expect(useMultiSelectStore.getState().selectedType).toBe('file');
  });

  it('does not open the item as well', () => {
    const onClick = vi.fn();
    render(<FolderItem folder={folder()} onClick={onClick} allFolders={[folder()]} />);

    pressMenu(menuButton('Reports'));

    // The click must not reach the row underneath, or opening a menu would
    // navigate into the folder behind it.
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('it replaces the selection rather than extending it', () => {
  it('drops an existing selection when a different row is used', () => {
    const folders = [
      folder(),
      folder({ id: 'taxes', name: 'Taxes', Prefix: 'taxes/' }),
      folder({ id: 'photos', name: 'Photos', Prefix: 'photos/' }),
    ];
    render(
      <>
        <FolderItem folder={folders[0]} index={0} allFolders={folders} />
        <FolderItem folder={folders[1]} index={1} allFolders={folders} />
        <FolderItem folder={folders[2]} index={2} allFolders={folders} />
      </>
    );

    // Two selected by keyboard, the way multi-select is meant to be built.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reports, folder' }), {
      key: 'Enter',
      ctrlKey: true,
    });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Taxes, folder' }), {
      key: 'Enter',
      ctrlKey: true,
    });
    expect(selection()).toHaveLength(2);

    pressMenu(menuButton('Photos'));

    // Plain click semantics: the third replaces the other two.
    expect(selection()).toHaveLength(1);
    expect(selection()[0]).toMatchObject({ name: 'Photos' });
  });
});

describe('touch is left alone', () => {
  it('does not select on a touchscreen', () => {
    setPointer({ touch: true });
    render(<FolderItem folder={folder()} allFolders={[folder()]} />);

    pressMenu(menuButton('Reports'));

    // Selecting here would put the list into selection mode, where the next
    // tap on any row selects instead of opening it.
    expect(selection()).toHaveLength(0);
  });

  it('does not select on a touchscreen for files either', () => {
    setPointer({ touch: true });
    render(<FileItemMobile file={file()} allFiles={[file()]} />);

    pressMenu(menuButton('budget.xlsx'));

    expect(selection()).toHaveLength(0);
  });
});

/**
 * Moving selection onto pointerdown widened what could trigger it: click only
 * ever fires for the primary button, pointerdown fires for all of them. These
 * pin the guards that put the boundary back, and they mirror the ones Radix
 * puts on its own trigger - a press that does not open the menu must not select
 * either, or the row silently changes under a menu that never appeared.
 */
describe('presses that do not open the menu do not select', () => {
  it('ignores a secondary click', () => {
    render(<FolderItem folder={folder()} allFolders={[folder()]} />);

    pressMenu(menuButton('Reports'), { button: 2 });

    expect(selection()).toHaveLength(0);
  });

  it('ignores a ctrl-click, which is a secondary click on macOS', () => {
    render(<FolderItem folder={folder()} allFolders={[folder()]} />);

    pressMenu(menuButton('Reports'), { button: 0, ctrlKey: true });

    expect(selection()).toHaveLength(0);
  });

  it('still selects on an ordinary press', () => {
    render(<FolderItem folder={folder()} allFolders={[folder()]} />);

    pressMenu(menuButton('Reports'));

    expect(selection()).toHaveLength(1);
  });
});
