/**
 * Overflow menu keyboard access.
 *
 * The menu advertised `role="menu"` and `role="menuitem"` while implementing no
 * arrow keys, no Home/End and no focus management, so a screen reader announced
 * a menu and told the user to press keys that did nothing. It is a Radix
 * dropdown now, and these tests pin the behaviour that buys, from the outside:
 * open it with the keyboard, walk it with the keyboard, and get focus back.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FolderOverflowMenu } from './folder-overflow-menu';
import type { Folder } from '@/features/dashboard/types/folder';

const { push, openRenameDialog } = vi.hoisted(() => ({
  push: vi.fn(),
  openRenameDialog: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/features/dashboard/hooks/use-delete-with-progress', () => ({
  useDeleteWithProgress: () => ({ deleteFolder: vi.fn(), isDeleting: () => false }),
}));

vi.mock('@/context/rename-context', () => ({
  useRename: () => ({ isRenaming: () => false, showRenameDialog: openRenameDialog }),
}));

vi.mock('@/context/data-context', () => ({
  useDriveStore: () => ({ currentPrefix: '' }),
}));

const folder = { name: 'Reports', Prefix: 'Reports/', id: 'Reports/' } as Folder;

function show() {
  return render(
    <FolderOverflowMenu
      folder={folder}
      trigger={<button aria-label="More actions for Reports">menu</button>}
    />
  );
}

const trigger = () => screen.getByRole('button', { name: 'More actions for Reports' });
const items = () => screen.getAllByRole('menuitem');

/** Opens the menu the way a keyboard user does and waits for it to settle. */
async function openWithKeyboard(key: string) {
  trigger().focus();
  fireEvent.keyDown(trigger(), { key });
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeNull());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('opening', () => {
  it('is closed until asked for', () => {
    show();

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it.each(['Enter', ' ', 'ArrowDown'])('opens on %s', async (key) => {
    show();

    await openWithKeyboard(key);

    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('tells assistive tech the trigger opens a menu', () => {
    show();

    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('marks the trigger expanded while open', async () => {
    show();

    await openWithKeyboard('Enter');

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });
});

describe('moving through the items', () => {
  it('focuses the first item when opened downward', async () => {
    show();

    await openWithKeyboard('ArrowDown');

    // Announcing a menu and leaving focus behind on the trigger is what made
    // the old roles actively misleading.
    await waitFor(() => expect(document.activeElement).toBe(items()[0]));
  });

  it('walks down with ArrowDown', async () => {
    show();
    await openWithKeyboard('ArrowDown');
    await waitFor(() => expect(document.activeElement).toBe(items()[0]));

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });

    await waitFor(() => expect(document.activeElement).toBe(items()[1]));
  });

  it('walks back up with ArrowUp', async () => {
    show();
    await openWithKeyboard('ArrowDown');
    await waitFor(() => expect(document.activeElement).toBe(items()[0]));

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(items()[1]));

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });

    await waitFor(() => expect(document.activeElement).toBe(items()[0]));
  });

  it('jumps to the last item with End and back with Home', async () => {
    show();
    await openWithKeyboard('ArrowDown');
    await waitFor(() => expect(document.activeElement).toBe(items()[0]));

    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    await waitFor(() => expect(document.activeElement).toBe(items()[items().length - 1]));

    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    await waitFor(() => expect(document.activeElement).toBe(items()[0]));
  });
});

describe('choosing and dismissing', () => {
  it('runs the focused action on Enter', async () => {
    show();
    await openWithKeyboard('ArrowDown');
    await waitFor(() => expect(document.activeElement).toBe(items()[0]));

    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });

    // First item is Open, which navigates into the folder.
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it('closes on Escape and puts focus back on the trigger', async () => {
    show();
    await openWithKeyboard('ArrowDown');
    await waitFor(() => expect(document.activeElement).toBe(items()[0]));

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    // Dropping focus to the body would leave a keyboard user at the top of the
    // page with no idea where they were.
    await waitFor(() => expect(document.activeElement).toBe(trigger()));
  });
});

describe('where it opens', () => {
  it('opens beside the button, never above or below it', async () => {
    show();

    await openWithKeyboard('ArrowDown');

    // Which side it lands on is up to the space available, so this pins the
    // part that matters: not above or below, because that covers the rows
    // underneath along with their own menu buttons.
    const side = screen.getByRole('menu').getAttribute('data-side');
    expect(['left', 'right']).toContain(side);
  });

  it('prefers the right, so a menu with room does not jump left', async () => {
    show();

    await openWithKeyboard('ArrowDown');

    // Radix flips this to the left on its own when the right will not fit.
    // Asking for the left outright meant it opened there even with space.
    expect(screen.getByRole('menu').getAttribute('data-side')).toBe('right');
  });

  it('lines its top up with the button', async () => {
    show();

    await openWithKeyboard('ArrowDown');

    expect(screen.getByRole('menu').getAttribute('data-align')).toBe('start');
  });
});

describe('the page underneath', () => {
  it('does not freeze page scrolling while open', async () => {
    show();

    await openWithKeyboard('ArrowDown');

    // The menu used to set document.body.style.overflow itself just to show a
    // dropdown, which is half of what made #86 possible.
    expect(document.body.style.overflow).toBe('');
  });
});
