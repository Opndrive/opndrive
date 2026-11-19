/**
 * The list view draws what is near the screen and reads pages as the user
 * scrolls.
 *
 * jsdom does no layout, so the scroll container is given one: 640px tall, room
 * to scroll a long way, and a `scrollTo` that moves it and reports the scroll
 * the way a browser does. Rows are fixed-height, so nothing else needs
 * measuring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { VirtualDriveList } from './virtual-drive-list';
import { useDriveStore } from '@/context/data-context';
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
const ROW = 64;
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

function folder(label: string): Folder {
  return {
    id: `dir/${label}/`,
    name: label,
    Prefix: `dir/${label}/`,
    icon: 'folder',
    location: { type: 'my-drive', label: 'My Drive' },
  } as Folder;
}

/** A `<main>` with a size, a scroll position and a `scrollTo`, as the dashboard has. */
function scrollContainer() {
  const main = document.createElement('main');
  let top = 0;
  Object.defineProperties(main, {
    clientHeight: { configurable: true, get: () => VIEW },
    clientWidth: { configurable: true, get: () => 1024 },
    scrollHeight: { configurable: true, get: () => 50_000_000 },
    scrollTop: {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, value);
      },
    },
  });
  // A browser moves the element at once and reports the scroll afterwards,
  // never from inside the call that moved it - and not at all if it did not
  // move.
  main.scrollTo = ((options: ScrollToOptions) => {
    const before = main.scrollTop;
    main.scrollTop = options.top ?? before;
    if (main.scrollTop !== before) {
      queueMicrotask(() => act(() => main.dispatchEvent(new Event('scroll'))));
    }
  }) as typeof main.scrollTo;
  document.body.appendChild(main);
  return main;
}

let main: HTMLElement;

function show(ui: React.ReactElement) {
  return render(ui, { container: main });
}

/** What a person scrolling does: move the container, and it reports it. */
function scrollTo(top: number) {
  act(() => {
    main.scrollTop = top;
    main.dispatchEvent(new Event('scroll'));
  });
}

const drawnRows = () => main.querySelectorAll('[role="row"]');

beforeEach(() => {
  main = scrollContainer();
  useMultiSelectStore.getState().clearSelection();
});

afterEach(() => {
  main.remove();
  vi.useRealTimers();
});

describe('drawing only what is near the screen', () => {
  it('draws a screenful and a margin, not the whole folder', () => {
    show(<VirtualDriveList folders={[]} files={files(10_000)} complete nextPage={IDLE} />);

    // 640px of 64px rows is ten, plus a few either side.
    expect(drawnRows().length).toBeGreaterThanOrEqual(VIEW / ROW);
    expect(drawnRows().length).toBeLessThan(40);
    expect(screen.getByText(name(0))).toBeDefined();
    expect(screen.queryByText(name(5000))).toBeNull();
  });

  it('draws the rows the user has scrolled to', () => {
    show(<VirtualDriveList folders={[]} files={files(10_000)} complete nextPage={IDLE} />);

    scrollTo(5000 * ROW);

    expect(screen.getByText(name(5000))).toBeDefined();
    expect(screen.queryByText(name(0))).toBeNull();
    expect(drawnRows().length).toBeLessThan(40);
  });

  it('holds the whole list height, so the scrollbar is honest', () => {
    show(<VirtualDriveList folders={[]} files={files(1000)} complete nextPage={IDLE} />);

    const body = main.querySelector('[role="rowgroup"]') as HTMLElement;
    expect(body.style.height).toBe(`${1000 * ROW}px`);
  });
});

describe('reading the next page while scrolling', () => {
  // 100 rows and the loading row: 6,464px.
  const end = 100 * ROW + ROW;

  it('waits while the end is more than two screens away', () => {
    const onLoadMore = vi.fn();
    show(
      <VirtualDriveList
        folders={[]}
        files={files(100)}
        complete={false}
        nextPage={IDLE}
        onLoadMore={onLoadMore}
      />
    );

    scrollTo(end - VIEW - 3 * VIEW);

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('asks for it within two screens of the loaded end', () => {
    const onLoadMore = vi.fn();
    show(
      <VirtualDriveList
        folders={[]}
        files={files(100)}
        complete={false}
        nextPage={IDLE}
        onLoadMore={onLoadMore}
      />
    );

    scrollTo(end - VIEW - 2 * VIEW + 10);

    expect(onLoadMore).toHaveBeenCalled();
  });

  it('asks straight away when the first page does not fill two screens', () => {
    const onLoadMore = vi.fn();
    show(
      <VirtualDriveList
        folders={[]}
        files={files(5)}
        complete={false}
        nextPage={IDLE}
        onLoadMore={onLoadMore}
      />
    );

    expect(onLoadMore).toHaveBeenCalled();
  });

  it('does not ask again while a page is on the way', () => {
    const onLoadMore = vi.fn();
    show(
      <VirtualDriveList
        folders={[]}
        files={files(5)}
        complete={false}
        nextPage={{ status: 'loading' }}
        onLoadMore={onLoadMore}
      />
    );

    scrollTo(end);

    expect(onLoadMore).not.toHaveBeenCalled();
    expect(screen.getByText('Loading more…')).toBeDefined();
  });

  it('never asks once every page is in', () => {
    const onLoadMore = vi.fn();
    show(
      <VirtualDriveList
        folders={[]}
        files={files(5)}
        complete
        nextPage={IDLE}
        onLoadMore={onLoadMore}
      />
    );

    expect(onLoadMore).not.toHaveBeenCalled();
    expect(screen.queryByText('Loading more…')).toBeNull();
  });
});

describe('a page that fails', () => {
  const failed: PageState = {
    status: 'error',
    failure: {
      kind: 'network',
      title: 'Offline',
      detail: 'Check the connection.',
      retryable: true,
    },
  } as PageState;

  it('becomes a retry row and keeps every row above it', () => {
    show(
      <VirtualDriveList
        folders={[]}
        files={files(5)}
        complete={false}
        nextPage={failed}
        onLoadMore={vi.fn()}
      />
    );

    expect(screen.getByText("Couldn't load more")).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined();
    for (let i = 0; i < 5; i++) expect(screen.getByText(name(i))).toBeDefined();
  });

  it('is asked for again only by the retry', () => {
    const onLoadMore = vi.fn();
    show(
      <VirtualDriveList
        folders={[]}
        files={files(5)}
        complete={false}
        nextPage={failed}
        onLoadMore={onLoadMore}
      />
    );

    scrollTo(10 * ROW);
    expect(onLoadMore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});

describe('folders found on later pages', () => {
  it('says more folders may still appear until the folder is complete', () => {
    const { rerender } = show(
      <VirtualDriveList folders={[folder('a')]} files={files(5)} complete={false} nextPage={IDLE} />
    );

    expect(screen.getByText(/More folders may still appear/)).toBeDefined();

    rerender(
      <VirtualDriveList folders={[folder('a')]} files={files(5)} complete nextPage={IDLE} />
    );

    expect(screen.queryByText(/More folders may still appear/)).toBeNull();
  });

  it('keeps the rows on screen still when a folder joins the folders above them', () => {
    const list = files(1000);
    const { rerender } = show(
      <VirtualDriveList folders={[folder('a')]} files={list} complete={false} nextPage={IDLE} />
    );

    // Folder a, the 40px note, then the files: file 500 at the top of the screen.
    const at500 = ROW + 40 + 500 * ROW;
    scrollTo(at500);
    expect(screen.getByText(name(500))).toBeDefined();

    rerender(
      <VirtualDriveList
        folders={[folder('a'), folder('zz-archive')]}
        files={list}
        complete={false}
        nextPage={IDLE}
      />
    );

    // The new row went in above, so the scroll position moved by one row and
    // file 500 is exactly where it was on screen.
    expect(main.scrollTop).toBe(at500 + ROW);
  });
});

describe('telling a screen reader how big the folder is', () => {
  it('says the row count is unknown until the last page is in', () => {
    const { rerender } = show(
      <VirtualDriveList folders={[]} files={files(5)} complete={false} nextPage={IDLE} />
    );

    expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('-1');

    rerender(<VirtualDriveList folders={[]} files={files(5)} complete nextPage={IDLE} />);

    expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('5');
  });

  it('numbers each drawn row by its place in the whole list', () => {
    show(<VirtualDriveList folders={[]} files={files(10_000)} complete nextPage={IDLE} />);

    scrollTo(5000 * ROW);

    const indexes = Array.from(drawnRows(), (row) => Number(row.getAttribute('aria-rowindex')));
    expect(indexes).toContain(5001);
    expect(Math.min(...indexes)).toBeGreaterThan(4000);
  });

  it('announces what has loaded, politely and at most every two seconds', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const status = () => screen.getByRole('status').textContent;

    const { rerender } = show(
      <VirtualDriveList folders={[]} files={files(1000)} complete={false} nextPage={IDLE} />
    );
    // Opening a folder is not news.
    expect(status()).toBe('');

    rerender(
      <VirtualDriveList folders={[]} files={files(2000)} complete={false} nextPage={IDLE} />
    );
    expect(status()).toBe('2,000 items loaded');

    act(() => vi.advanceTimersByTime(500));
    rerender(
      <VirtualDriveList folders={[]} files={files(3000)} complete={false} nextPage={IDLE} />
    );
    expect(status()).toBe('2,000 items loaded');

    act(() => vi.advanceTimersByTime(1500));
    expect(status()).toBe('3,000 items loaded');

    rerender(<VirtualDriveList folders={[]} files={files(3000)} complete nextPage={IDLE} />);
    act(() => vi.advanceTimersByTime(2000));
    expect(status()).toBe('All 3,000 items loaded');
  });
});

describe('where the user was in each folder', () => {
  it('opens a folder where the user left it', () => {
    show(
      <VirtualDriveList
        folders={[]}
        files={files(1000)}
        complete
        nextPage={IDLE}
        listingKey="dir/"
        initialScrollOffset={300 * ROW}
      />
    );

    expect(main.scrollTop).toBe(300 * ROW);
    expect(screen.getByText(name(300))).toBeDefined();
  });

  it('remembers the position when the user leaves', () => {
    const rememberScrollOffset = vi.fn();
    useDriveStore.setState({ rememberScrollOffset });

    const { unmount } = show(
      <VirtualDriveList
        folders={[]}
        files={files(1000)}
        complete
        nextPage={IDLE}
        listingKey="dir/"
      />
    );

    scrollTo(1234);
    unmount();

    expect(rememberScrollOffset).toHaveBeenCalledWith('dir/', 1234);
  });
});

describe('keyboard focus', () => {
  it('keeps the focused row drawn after scrolling away from it', () => {
    show(<VirtualDriveList folders={[]} files={files(1000)} complete nextPage={IDLE} />);

    act(() => {
      screen.getByRole('button', { name: `${name(2)}, file` }).focus();
    });
    scrollTo(800 * ROW);

    expect(screen.getByText(name(800))).toBeDefined();
    expect(screen.getByText(name(2))).toBeDefined();
    expect(document.activeElement?.getAttribute('aria-label')).toBe(`${name(2)}, file`);
  });
});
