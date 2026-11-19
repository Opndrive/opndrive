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

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  ChevronDown,
  Copy,
  PencilLine,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useUploadQueueStore,
  type QueueNotice,
  type SkippedItem,
} from '../stores/use-upload-queue-store';
import { groupByFolder, skippedListText } from '../utils/skipped-list';

/**
 * How many names the open list renders. A drop can skip thousands, and every
 * row is a DOM node in a panel that re-renders often; the rest are one click
 * away in the copied list.
 */
const MAX_SHOWN_NAMES = 300;

/** How long "Copied" stays before the button says "Copy list" again. */
const COPIED_FEEDBACK_MS = 2000;

interface SkippedListProps {
  items: SkippedItem[];
  count: number;
}

/**
 * What a skipped notice stands for, closed until asked: "Show files" opens it
 * grouped by folder, and "Copy list" puts every path on the clipboard.
 *
 * A large drop used to put one notice per skipped file into the panel - up to
 * a hundred lines that said the same thing. The count is the notice now; the
 * names are here for whoever wants them.
 */
const SkippedList: React.FC<SkippedListProps> = ({ items, count }) => {
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const listId = useId();

  // Only worked out once opened: closed, nothing below needs it.
  const groups = useMemo(() => (open ? groupByFolder(items) : []), [open, items]);

  useEffect(() => {
    if (copy === 'idle') return;
    const timer = setTimeout(() => setCopy('idle'), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copy]);

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(skippedListText(items, count));
      setCopy('copied');
    } catch {
      // No clipboard: an insecure origin, or permission refused.
      setCopy('failed');
    }
  };

  let shown = 0;
  const unlisted = count - items.length;

  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="-ml-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors duration-150 hover:bg-[color-mix(in_srgb,currentColor_10%,transparent)] focus-visible:outline-2 focus-visible:outline-primary"
          style={{ color: 'var(--primary)' }}
        >
          <ChevronDown
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
          {open ? 'Hide files' : 'Show files'}
        </button>

        <button
          type="button"
          onClick={() => void copyList()}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors duration-150 hover:bg-[color-mix(in_srgb,currentColor_10%,transparent)] focus-visible:outline-2 focus-visible:outline-primary"
          style={{ color: 'var(--primary)' }}
        >
          {copy === 'copied' ? (
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <Copy aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {copy === 'copied' ? 'Copied' : copy === 'failed' ? 'Could not copy' : 'Copy list'}
        </button>
        {/* Said once, for a screen reader; the button label above also changes. */}
        <span role="status" className="sr-only">
          {copy === 'copied' ? 'List copied' : copy === 'failed' ? 'Could not copy the list' : ''}
        </span>
      </div>

      {open && (
        <div
          id={listId}
          className="mt-1.5 max-h-48 overflow-y-auto custom-scrollbar rounded-md border px-2.5 py-2"
          style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
        >
          <ul className="space-y-2">
            {groups.map((group) => {
              if (shown >= MAX_SHOWN_NAMES) return null;
              const names = group.names.slice(0, MAX_SHOWN_NAMES - shown);
              shown += names.length;

              return (
                <li key={group.folder}>
                  <p
                    className="text-xs font-medium wrap-anywhere"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {group.folder || 'Top level'}
                    <span style={{ color: 'var(--muted-foreground)' }}>
                      {' '}
                      · {group.names.length}
                    </span>
                  </p>
                  <ul className="mt-0.5 space-y-px pl-3">
                    {names.map((name, index) => (
                      <li
                        key={`${name}-${index}`}
                        className="text-xs leading-4.5 wrap-anywhere"
                        style={{ color: 'var(--muted-foreground)' }}
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          {(items.length > shown || unlisted > 0) && (
            <p className="mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
              {count - shown} more not shown. Copy the list to see{' '}
              {unlisted > 0 ? `the first ${items.length}` : 'them all'}.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

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
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tone.accent }} />

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
            className="-mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-[color-mix(in_srgb,currentColor_14%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            style={{ color: 'var(--muted-foreground)' }}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <p
          className="mt-0.5 pr-1.5 text-xs leading-4.5 wrap-anywhere"
          style={{ color: 'var(--foreground)' }}
        >
          {notice.detail}
        </p>

        {notice.items && notice.items.length > 0 && (
          <SkippedList items={notice.items} count={notice.count} />
        )}
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
            className="-mr-1.5 rounded px-1.5 py-0.5 text-xs font-medium transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary"
            style={{ color: 'var(--primary)' }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Tall enough on a wide screen for two notices of four lines each, so
          a warning and a rename are both seen without scrolling. */}
      <ul className="max-h-56 sm:max-h-72 space-y-2 overflow-y-auto custom-scrollbar px-3 py-2.5">
        {notices.map((notice) => (
          <NoticeRow key={notice.id} notice={notice} onDismiss={handleDismiss} />
        ))}
      </ul>
    </section>
  );
});
QueueNotices.displayName = 'QueueNotices';
