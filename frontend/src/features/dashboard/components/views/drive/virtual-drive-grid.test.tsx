/**
 * The grid view draws the rows of cards near the screen, moves focus with the
 * arrow keys, and selects across rows that are not drawn.
 *
 * jsdom does no layout, so it is given some: a 640px `<main>` that can scroll,
 * a container 1,000px wide (four columns), and rows whose height follows what
 * they hold - a heading 48px, a row of folder cards 76px, a row of file cards
 * 240px, the note 40px and the loading row 64px.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { VirtualDriveGrid } from './virtual-drive-grid';
import { useMultiSelectStore } from '../../../stores/use-multi-select-store';
import type { Folder } from '@/features/dashboard/types/folder';
import type { FileItem } from '@/features/dashboard/types/file';
import type { PageState } from '@/context/folder-listing';

vi.mock('../../ui/menus/folder-overflow-menu', () => ({
  FolderOverflowMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock('../../ui/menus/file-overflow-menu', () => ({
  FileOverflowMenu: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));
vi.mock('../../ui/items/file-thumbnail-with-image', () => ({
  FileThumbnailWithImage: () => <div className="h-32" />,
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

const VIEW = 640;
const FILE_ROW = 240;
const IDLE: PageState = { status: 'idle' };
const name = (i: number) => `file-${String(i).padStart(6, '0')}.txt`;

function files(count: number): FileItem[] {
  return Array.from(
    { length: count },
    (_, i) =>
      ({
        id: `dir/${name(i)}`,
        name: name(i),
        Key: `dir/${name(i)}`,
        extension: 'txt',
        size: { value: 1, unit: 'KB' },
        lastModified: new Date('2026-08-01'),
      }) as FileItem
  );
}

function folders(count: number): Folder[] {
  return Array.from(
    { length: count },
    (_, i) =>
      ({
        id: `dir/folder-${i}/`,
        name: `folder-${i}`,
        Prefix: `dir/folder-${i}/`,
        icon: 'folder',
        location: { type: 'my-drive', label: 'My Drive' },
      }) as Folder
  );
}

/** The height a row draws at, from what it holds. */
function rowHeight(row: HTMLElement): number {
  if (row.querySelector('[role="columnheader"]')) return 48;
  if (row.querySelector('[data-file-item]')) return FILE_ROW;
  if (row.querySelector('[data-folder-item]')) return 76;
  if (row.textContent?.includes('More folders')) return 40;
  return 64;
}

let main: HTMLElement;
const originals = {
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
  clientWidth: Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth'),
};

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('role') === 'row' ? rowHeight(this) : 0;
    },
  });
  Object.defineProperty(Element.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1000,
  });

  main = document.createElement('main');
  let top = 0;
  Object.defineProperties(main, {
    clientHeight: { configurable: true, get: () => VIEW },
    scrollHeight: { configurable: true, get: () => 50_000_000 },
    scrollTop: {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, value);
      },
    },
  });
  main.scrollTo = ((options: ScrollToOptions) => {
    const before = main.scrollTop;
    main.scrollTop = options.top ?? before;
    if (main.scrollTop !== before) {
      queueMicrotask(() => act(() => main.dispatchEvent(new Event('scroll'))));
    }
  }) as typeof main.scrollTo;
  document.body.appendChild(main);
  useMultiSelectStore.getState().clearSelection();

  // A mouse, not a touchscreen: a click selects rather than opens.
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
  delete (window as unknown as Record<string, unknown>).ontouchstart;
});

afterEach(() => {
  main.remove();
  if (originals.offsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originals.offsetHeight);
  }
  if (originals.clientWidth) {
    Object.defineProperty(Element.prototype, 'clientWidth', originals.clientWidth);
  }
});

const show = (ui: React.ReactElement) => render(ui, { container: main });

function scrollTo(top: number) {
  act(() => {
    main.scrollTop = top;
    main.dispatchEvent(new Event('scroll'));
  });
}

const cards = () => main.querySelectorAll('[data-file-item], [data-folder-item]');
const card = (label: string) => screen.getByRole('button', { name: `${label}, file` });

describe('drawing only what is near the screen', () => {
  it('draws a few rows of cards, not the whole folder', () => {
    show(<VirtualDriveGrid folders={[]} files={files(10_000)} complete nextPage={IDLE} />);

    expect(cards().length).toBeGreaterThan(0);
    expect(cards().length).toBeLessThan(60);
    expect(screen.getByRole('grid').getAttribute('aria-colcount')).toBe('4');
  });

  it('puts four cards in a row at this width', () => {
    show(<VirtualDriveGrid folders={[]} files={files(10)} complete nextPage={IDLE} />);

    const firstRow = main
      .querySelector('[role="row"] [data-item-index="0"]')!
      .closest('[role="row"]')!;
    expect(firstRow.querySelectorAll('[role="gridcell"]')).toHaveLength(4);
  });

  it('draws the cards the user has scrolled to', () => {
    show(<VirtualDriveGrid folders={[]} files={files(10_000)} complete nextPage={IDLE} />);

    // The Files heading, then 240px rows of four.
    scrollTo(48 + 1000 * FILE_ROW);

    expect(screen.getByText(name(4000))).toBeDefined();
    expect(screen.queryByText(name(0))).toBeNull();
  });

  it('heads the folders and the files as rows of the same grid', () => {
    show(<VirtualDriveGrid folders={folders(3)} files={files(3)} complete nextPage={IDLE} />);

    const headings = screen.getAllByRole('columnheader');
    expect(headings.map((h) => h.textContent)).toEqual(['Folders', 'Files']);
    // The first section carries the layout toggle.
    expect(headings[0]!.querySelector('[aria-label="Grid view"]')).not.toBeNull();
    expect(headings[1]!.querySelector('[aria-label="Grid view"]')).toBeNull();
  });
});

describe('folders found on later pages, and the pages still to come', () => {
  it('notes that more folders may appear, and shows the loading row', () => {
    show(
      <VirtualDriveGrid folders={folders(2)} files={files(4)} complete={false} nextPage={IDLE} />
    );

    expect(screen.getByText(/More folders may still appear/)).toBeDefined();
    expect(screen.getByText('Loading more…')).toBeDefined();
    expect(screen.getByRole('grid').getAttribute('aria-rowcount')).toBe('-1');
  });

  it('asks for the next page near the end, and offers a retry when it fails', () => {
    const onLoadMore = vi.fn();
    const { rerender } = show(
      <VirtualDriveGrid
        folders={[]}
        files={files(8)}
        complete={false}
        nextPage={IDLE}
        onLoadMore={onLoadMore}
      />
    );

    expect(onLoadMore).toHaveBeenCalled();
    onLoadMore.mockClear();

    rerender(
      <VirtualDriveGrid
        folders={[]}
        files={files(8)}
        complete={false}
        nextPage={{ status: 'error' }}
        onLoadMore={onLoadMore}
      />
    );
    expect(onLoadMore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('keeps the cards on screen still when a folder joins the folders above them', () => {
    const list = files(4000);
    const { rerender } = show(
      <VirtualDriveGrid folders={folders(4)} files={list} complete={false} nextPage={IDLE} />
    );

    // Folders heading, one row of four folders, the note, the Files heading.
    const filesStart = 48 + 76 + 40 + 48;
    scrollTo(filesStart + 500 * FILE_ROW);
    const before = main.scrollTop;

    rerender(
      <VirtualDriveGrid folders={folders(5)} files={list} complete={false} nextPage={IDLE} />
    );

    // A fifth folder starts a second row of folders above everything on screen.
    expect(main.scrollTop).toBe(before + 76);
  });
});

describe('the keyboard', () => {
  it('moves focus with the arrow keys, row by row and into the files', () => {
    show(<VirtualDriveGrid folders={folders(2)} files={files(12)} complete nextPage={IDLE} />);

    const first = screen.getByRole('button', { name: 'folder-0, folder' });
    act(() => first.focus());

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('folder-1, folder');

    // Down from the last row of folders goes on into the files, same column.
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe(`${name(1)}, file`);

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('aria-label')).toBe(`${name(5)}, file`);
  });

  it('scrolls a card that is not drawn into view and focuses it', async () => {
    show(<VirtualDriveGrid folders={[]} files={files(4000)} complete nextPage={IDLE} />);

    const first = card(name(0));
    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'End' });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(main.scrollTop).toBeGreaterThan(900 * FILE_ROW);
    expect(document.activeElement?.getAttribute('aria-label')).toBe(`${name(3999)}, file`);
  });

  it('keeps the focused card drawn after scrolling away from it', () => {
    show(<VirtualDriveGrid folders={[]} files={files(4000)} complete nextPage={IDLE} />);

    act(() => card(name(1)).focus());
    scrollTo(48 + 800 * FILE_ROW);

    expect(screen.getByText(name(3200))).toBeDefined();
    expect(document.activeElement?.getAttribute('aria-label')).toBe(`${name(1)}, file`);
  });
});

describe('selecting', () => {
  it('shift-clicks a range across rows that are not drawn', () => {
    show(<VirtualDriveGrid folders={[]} files={files(4000)} complete nextPage={IDLE} />);

    fireEvent.click(card(name(2)));
    scrollTo(48 + 500 * FILE_ROW);
    fireEvent.click(card(name(2001)), { shiftKey: true });

    const selected = useMultiSelectStore.getState().selectedItems;
    expect(selected).toHaveLength(2000);
    expect(selected[0]!.name).toBe(name(2));
    expect(selected[selected.length - 1]!.name).toBe(name(2001));
  });

  it('runs a range from a folder card into the files', () => {
    show(<VirtualDriveGrid folders={folders(2)} files={files(4)} complete nextPage={IDLE} />);

    fireEvent.click(screen.getByRole('button', { name: 'folder-1, folder' }));
    fireEvent.click(card(name(1)), { shiftKey: true });

    expect(useMultiSelectStore.getState().selectedItems.map((item) => item.name)).toEqual([
      'folder-1',
      name(0),
      name(1),
    ]);
  });

  it('selects everything loaded with Ctrl+A', () => {
    show(
      <VirtualDriveGrid folders={folders(3)} files={files(3000)} complete={false} nextPage={IDLE} />
    );

    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });

    expect(useMultiSelectStore.getState().selectedItems).toHaveLength(3003);
  });

  it('leaves Ctrl+A alone while typing', () => {
    show(<VirtualDriveGrid folders={[]} files={files(10)} complete nextPage={IDLE} />);
    const input = document.createElement('input');
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: 'a', ctrlKey: true });

    expect(useMultiSelectStore.getState().selectedItems).toHaveLength(0);
    input.remove();
  });
});

describe('folding a section', () => {
  it('hides its cards and keeps its heading', () => {
    show(<VirtualDriveGrid folders={folders(3)} files={files(3)} complete nextPage={IDLE} />);

    fireEvent.click(screen.getByRole('button', { name: 'Folders' }));

    expect(screen.queryByText('folder-0')).toBeNull();
    expect(screen.getByRole('button', { name: 'Folders' }).getAttribute('aria-expanded')).toBe(
      'false'
    );
    expect(screen.getByText(name(0))).toBeDefined();
  });
});
