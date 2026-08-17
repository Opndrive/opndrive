/**
 * The "Open with" submenu.
 *
 * It used to open on hover only, with no key handling anywhere, so Preview and
 * Open in new tab were unreachable by keyboard entirely - the menu announced
 * itself as a menu and then hid two of its actions behind a mouse. As a Radix
 * submenu it opens on Enter or ArrowRight and closes on ArrowLeft.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FileOverflowMenu } from './file-overflow-menu';
import type { FileItem } from '@/features/dashboard/types/file';

const { openPreview, openPreviewInNewTab } = vi.hoisted(() => ({
  openPreview: vi.fn(),
  openPreviewInNewTab: vi.fn(),
}));

vi.mock('@/features/dashboard/hooks/use-download', () => ({
  useDownloadActions: () => ({ downloadFile: vi.fn() }),
  useIsFileDownloading: () => false,
}));
vi.mock('@/features/dashboard/hooks/use-delete-with-progress', () => ({
  useDeleteWithProgress: () => ({ deleteFile: vi.fn(), isDeleting: () => false }),
}));
vi.mock('@/context/rename-context', () => ({
  useRename: () => ({ isRenaming: () => false, showRenameDialog: vi.fn() }),
}));
vi.mock('@/context/details-context', () => ({ useDetails: () => ({ open: vi.fn() }) }));
vi.mock('@/context/file-preview-context', () => ({
  useFilePreview: () => ({ openPreview }),
}));
vi.mock('@/context/share-context', () => ({ useShare: () => ({ openShareDialog: vi.fn() }) }));
vi.mock('@/context/data-context', () => ({ useDriveStore: () => ({ currentPrefix: '' }) }));
vi.mock('@/lib/preview-url', () => ({ openPreviewInNewTab }));

const file = {
  id: 'q3.pdf',
  name: 'q3.pdf',
  Key: 'q3.pdf',
  ETag: 'etag-1',
  extension: 'pdf',
} as FileItem;

function show() {
  return render(
    <FileOverflowMenu
      file={file}
      trigger={<button aria-label="More actions for q3.pdf">menu</button>}
    />
  );
}

const trigger = () => screen.getByRole('button', { name: 'More actions for q3.pdf' });

/** Opens the menu and moves focus onto the "Open with" row. */
async function focusOpenWith() {
  trigger().focus();
  fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeNull());

  const openWith = screen.getByText('Open with').closest('[role="menuitem"]') as HTMLElement;
  await act(async () => {
    openWith.focus();
  });
  return openWith;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reaching the submenu with a keyboard', () => {
  it('puts Open with first, so it is one ArrowDown away', async () => {
    show();
    trigger().focus();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeNull());
    expect(screen.getAllByRole('menuitem')[0]!.textContent).toContain('Open with');
  });

  it('opens the submenu on ArrowRight', async () => {
    show();
    const openWith = await focusOpenWith();

    fireEvent.keyDown(openWith, { key: 'ArrowRight' });

    await waitFor(() => expect(screen.getByText('Preview')).toBeTruthy());
    expect(screen.getByText('Open in new tab')).toBeTruthy();
  });

  it('opens the submenu on Enter', async () => {
    show();
    const openWith = await focusOpenWith();

    fireEvent.keyDown(openWith, { key: 'Enter' });

    await waitFor(() => expect(screen.getByText('Preview')).toBeTruthy());
  });

  it('closes the submenu again on ArrowLeft', async () => {
    show();
    const openWith = await focusOpenWith();
    fireEvent.keyDown(openWith, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByText('Preview')).toBeTruthy());

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });

    await waitFor(() => expect(screen.queryByText('Preview')).toBeNull());
  });

  it('reaches Preview, which had no keyboard path at all before', async () => {
    show();
    const openWith = await focusOpenWith();
    fireEvent.keyDown(openWith, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByText('Preview')).toBeTruthy());

    const preview = screen.getByText('Preview').closest('[role="menuitem"]') as HTMLElement;
    await act(async () => {
      preview.focus();
    });
    fireEvent.keyDown(preview, { key: 'Enter' });

    await waitFor(() => expect(openPreview).toHaveBeenCalled());
  });

  it('reaches Open in new tab too', async () => {
    show();
    const openWith = await focusOpenWith();
    fireEvent.keyDown(openWith, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByText('Open in new tab')).toBeTruthy());

    const newTab = screen.getByText('Open in new tab').closest('[role="menuitem"]') as HTMLElement;
    await act(async () => {
      newTab.focus();
    });
    fireEvent.keyDown(newTab, { key: 'Enter' });

    await waitFor(() =>
      expect(openPreviewInNewTab).toHaveBeenCalledWith({
        key: 'q3.pdf',
      })
    );
  });
});

describe('where it opens', () => {
  it('opens beside the button rather than over the rows below', async () => {
    show();
    trigger().focus();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeNull());

    const menu = screen.getByRole('menu');
    // The side follows the space available; what must not happen is above or
    // below, which covers the rows underneath and their own menu buttons.
    expect(['left', 'right']).toContain(menu.getAttribute('data-side'));
    expect(menu.getAttribute('data-align')).toBe('start');
  });

  it('prefers the right and lets Radix flip it when there is no room', async () => {
    show();
    trigger().focus();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeNull());

    expect(screen.getByRole('menu').getAttribute('data-side')).toBe('right');
  });
});

describe('the page underneath', () => {
  it('does not freeze page scrolling while open', async () => {
    show();
    trigger().focus();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeNull());

    expect(document.body.style.overflow).toBe('');
  });
});
