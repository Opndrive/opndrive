'use client';

/**
 * Renders what a drop could not do quietly.
 *
 * Three things reach here, and the distinction matters to the user:
 *
 *  - `renamed`    - we resolved a collision for them. Informational.
 *  - `skipped`    - files that never made it off disk, usually a permission
 *                   lock. Their data is NOT in the bucket.
 *  - `unverified` - we could not reach S3 to check whether the name was free,
 *                   so the folder is uploading under a name that might already
 *                   exist. This is the only one that can still lose data, so it
 *                   is styled as a warning rather than a note.
 *
 * Before this existed the notices were computed, aggregated, capped, and then
 * never shown to anyone.
 */

import React, { useCallback } from 'react';
import { HiOutlineXMark } from 'react-icons/hi2';
import { useUploadQueueStore, type QueueNotice } from '../stores/use-upload-queue-store';

const ACCENT: Record<QueueNotice['kind'], string> = {
  renamed: 'var(--primary)',
  skipped: 'var(--muted-foreground)',
  // Amber like 'unverified': something was done that cannot be undone, and the
  // reader did not ask for it in the moment.
  replaced: '#f59e0b',
  unverified: '#f59e0b',
};

const LABEL: Record<QueueNotice['kind'], string> = {
  renamed: 'Renamed',
  skipped: 'Skipped',
  replaced: 'Replaced',
  unverified: 'Not verified',
};

interface NoticeRowProps {
  notice: QueueNotice;
  onDismiss: (id: string) => void;
}

/**
 * Memoised on the notice object, which the store only replaces when the list
 * actually changes. The panel around this re-renders on every progress tick.
 */
const NoticeRow: React.FC<NoticeRowProps> = React.memo(({ notice, onDismiss }) => (
  <div
    data-testid="queue-notice"
    data-kind={notice.kind}
    className="flex items-start gap-2 px-4 py-2"
    style={{ borderBottom: '1px solid var(--border)' }}
  >
    <span
      className="text-[10px] font-semibold uppercase tracking-wide mt-0.5 flex-shrink-0"
      style={{ color: ACCENT[notice.kind] }}
    >
      {LABEL[notice.kind]}
    </span>

    <div className="flex-1 min-w-0">
      <p className="text-xs" style={{ color: 'var(--foreground)' }}>
        {notice.detail}
      </p>
      {notice.count > 1 && (
        <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          {notice.count} items
        </p>
      )}
    </div>

    <button
      onClick={() => onDismiss(notice.id)}
      aria-label={`Dismiss notice: ${notice.detail}`}
      className="p-1 rounded transition-colors duration-200 flex-shrink-0"
      style={{ color: 'var(--muted-foreground)' }}
    >
      <HiOutlineXMark className="w-3 h-3" />
    </button>
  </div>
));
NoticeRow.displayName = 'NoticeRow';

/**
 * Takes no props deliberately: it subscribes to the QUEUE store, which no
 * progress tick ever touches, so wrapping it in memo keeps it out of the
 * upload panel's render path entirely.
 */
export const QueueNotices: React.FC = React.memo(() => {
  const notices = useUploadQueueStore((state) => state.notices);
  const dismissNotice = useUploadQueueStore((state) => state.dismissNotice);
  const clearNotices = useUploadQueueStore((state) => state.clearNotices);

  const handleDismiss = useCallback((id: string) => dismissNotice(id), [dismissNotice]);

  if (notices.length === 0) return null;

  return (
    <div data-testid="queue-notices">
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ background: 'var(--secondary)' }}
      >
        <p className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
          {notices.length === 1 ? '1 notice' : `${notices.length} notices`}
        </p>
        <button
          onClick={clearNotices}
          className="text-xs font-medium"
          style={{ color: 'var(--primary)' }}
        >
          Clear all
        </button>
      </div>

      <div className="max-h-40 overflow-y-auto custom-scrollbar">
        {notices.map((notice) => (
          <NoticeRow key={notice.id} notice={notice} onDismiss={handleDismiss} />
        ))}
      </div>
    </div>
  );
});
QueueNotices.displayName = 'QueueNotices';
