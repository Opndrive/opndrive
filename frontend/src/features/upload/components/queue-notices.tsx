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
import { Ban, PencilLine, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { useUploadQueueStore, type QueueNotice } from '../stores/use-upload-queue-store';

interface Tone {
  icon: LucideIcon;
  /** The title and the icon. Each is at least 4.5:1 on its own surface. */
  accent: string;
  surface: string;
  border: string;
}

/**
 * Each kind is a small callout: an icon and a title in the kind's colour, on
 * a tint of it, so a warning reads as one at a glance and two notices of
 * different kinds cannot be mistaken for each other.
 */
const TONE: Record<QueueNotice['kind'], Tone> = {
  renamed: {
    icon: PencilLine,
    accent: 'var(--info-foreground)',
    surface: 'var(--info-surface)',
    border: 'var(--info-border)',
  },
  skipped: {
    icon: Ban,
    accent: 'var(--foreground)',
    surface: 'var(--surface-sunken)',
    border: 'var(--border)',
  },
  // A warning like 'unverified': something was done that cannot be undone,
  // and the reader did not ask for it in the moment.
  replaced: {
    icon: TriangleAlert,
    accent: 'var(--warning)',
    surface: 'var(--warning-surface)',
    border: 'var(--warning-border)',
  },
  unverified: {
    icon: TriangleAlert,
    accent: 'var(--warning)',
    surface: 'var(--warning-surface)',
    border: 'var(--warning-border)',
  },
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
 *
 * The title and the dismiss button share the top line, and the detail runs
 * beneath the title at full width. Side by side with the label, the detail
 * was squeezed into a narrow column five or six lines tall.
 */
const NoticeRow: React.FC<NoticeRowProps> = React.memo(({ notice, onDismiss }) => {
  const tone = TONE[notice.kind];
  const Icon = tone.icon;

  return (
    <li
      data-testid="queue-notice"
      data-kind={notice.kind}
      className="flex gap-2.5 rounded-lg border py-2.5 pl-3 pr-1.5"
      style={{ background: tone.surface, borderColor: tone.border }}
    >
      <Icon
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 flex-shrink-0"
        style={{ color: tone.accent }}
      />

      <div className="min-w-0 flex-1">
        <div data-testid="queue-notice-header" className="flex items-start justify-between gap-2">
          <p className="pt-px text-[13px] leading-5" style={{ color: tone.accent }}>
            <span className="font-medium">{LABEL[notice.kind]}</span>
            {notice.count > 1 && (
              <>
                <span aria-hidden="true"> · </span>
                <span>{notice.count} items</span>
              </>
            )}
          </p>

          <button
            type="button"
            onClick={() => onDismiss(notice.id)}
            aria-label={`Dismiss notice: ${notice.detail}`}
            title="Dismiss"
            className="-mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-[color-mix(in_srgb,currentColor_14%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--primary)]"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <p
          className="mt-0.5 pr-1.5 text-xs leading-[18px] [overflow-wrap:anywhere]"
          style={{ color: 'var(--foreground)' }}
        >
          {notice.detail}
        </p>
      </div>
    </li>
  );
});
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
    <section
      data-testid="queue-notices"
      aria-label="Upload notices"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      {/* Only for two or more. Over a single notice, "1 notice" and "Clear
          all" are a whole row repeating its own dismiss button. */}
      {notices.length > 1 && (
        <div className="flex items-center justify-between px-4 pt-2.5">
          <p className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>
            {notices.length} notices
          </p>
          <button
            type="button"
            onClick={clearNotices}
            className="-mr-1.5 rounded px-1.5 py-0.5 text-xs font-medium transition-colors duration-150 hover:bg-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
            style={{ color: 'var(--primary)' }}
          >
            Clear all
          </button>
        </div>
      )}

      <ul className="max-h-56 space-y-2 overflow-y-auto custom-scrollbar px-3 py-2.5">
        {notices.map((notice) => (
          <NoticeRow key={notice.id} notice={notice} onDismiss={handleDismiss} />
        ))}
      </ul>
    </section>
  );
});
QueueNotices.displayName = 'QueueNotices';
