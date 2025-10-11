'use client';

import { useMultiSelectStore } from '../../stores/use-multi-select-store';
import {
  HiOutlineX,
  HiOutlineShare,
  HiOutlineDownload,
  HiOutlineTrash,
  HiOutlineDotsVertical,
} from 'react-icons/hi';
import { AriaLabel } from '@/shared/components/custom-aria-label';

export function MultiSelectToolbar() {
  const { clearSelection, getSelectionCount } = useMultiSelectStore();

  const count = getSelectionCount();

  if (count === 0) {
    return null;
  }

  return (
    <div
      data-multi-select-toolbar
      className="w-full px-4 py-2 rounded-2xl shadow-md flex items-center justify-between transition-all duration-200"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Left side: Selection count and close button */}
      <div className="flex items-center gap-3">
        <AriaLabel label="Clear selection">
          <button
            onClick={clearSelection}
            className="p-1 rounded-full transition-colors hover:bg-accent"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <HiOutlineX size={18} />
          </button>
        </AriaLabel>

        <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
          {count} selected
        </span>
      </div>

      {/* Right side: Action buttons */}
      <div className="flex items-center gap-1">
        <AriaLabel label="Share">
          <button
            className="p-2 rounded-full transition-colors hover:bg-accent"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <HiOutlineShare size={18} />
          </button>
        </AriaLabel>

        <AriaLabel label="Download">
          <button
            className="p-2 rounded-full transition-colors hover:bg-accent"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <HiOutlineDownload size={18} />
          </button>
        </AriaLabel>

        <AriaLabel label="Delete">
          <button
            className="p-2 rounded-full transition-colors hover:bg-accent"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <HiOutlineTrash size={18} />
          </button>
        </AriaLabel>

        <AriaLabel label="More actions">
          <button
            className="p-2 rounded-full transition-colors hover:bg-accent"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <HiOutlineDotsVertical size={18} />
          </button>
        </AriaLabel>
      </div>
    </div>
  );
}
