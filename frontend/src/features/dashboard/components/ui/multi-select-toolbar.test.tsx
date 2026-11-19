/**
 * "Select all" can only mean everything loaded: S3 lists a folder a page at a
 * time, and nothing can be done to a key that has not been listed. So the
 * offer says "loaded" until the last page is in, and names the whole count
 * only once the folder is complete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MultiSelectToolbar } from './multi-select-toolbar';
import { useMultiSelectStore } from '../../stores/use-multi-select-store';
import type { FileItem } from '../../types/file';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../../hooks/use-multi-select-actions', () => ({
  useMultiSelectActions: () => ({
    handleOpenFiles: vi.fn(),
    handleDownloadFiles: vi.fn(),
    handleShareFiles: vi.fn(),
    handleDeleteItems: vi.fn(),
  }),
}));

const file = (key: string) => ({ id: key, Key: key, name: key }) as FileItem;
const loaded = Array.from({ length: 3000 }, (_, i) => file(`f${i}`));

beforeEach(() => {
  useMultiSelectStore.getState().selectItem(loaded[0]!, 0, false, false, loaded);
});

function toolbar(complete: boolean, onSelectAll = vi.fn()) {
  render(
    <MultiSelectToolbar
      openMultiShareDialog={vi.fn()}
      selectAll={{ loaded: loaded.length, complete, onSelectAll }}
    />
  );
  return onSelectAll;
}

describe('select all', () => {
  it('offers the loaded items while the folder is still loading', () => {
    const onSelectAll = toolbar(false);

    fireEvent.click(screen.getByRole('button', { name: 'Select all 3,000 loaded' }));

    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('names the whole folder once it is complete', () => {
    toolbar(true);

    expect(screen.getByRole('button', { name: 'Select all 3,000 items' })).toBeDefined();
  });

  it('says what is held once everything loaded is selected', () => {
    useMultiSelectStore.getState().selectAll(loaded);
    toolbar(false);

    expect(screen.getByText('3,000 selected')).toBeDefined();
    expect(screen.getByText('Every item loaded so far')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Select all/ })).toBeNull();
  });

  it('is not offered where the toolbar has no folder to select from', () => {
    render(<MultiSelectToolbar openMultiShareDialog={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /^Select all/ })).toBeNull();
  });
});
