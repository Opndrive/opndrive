'use client';

import { useCallback, useRef, useState } from 'react';
import { Check, ChevronDown, Database, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { confirmAction } from '@/shared/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { useBuckets } from '@/features/dashboard/hooks/use-buckets';
import { useNotification } from '@/context/notification-context';
import { failureFrom } from '@/lib/s3/connection-failure';
import type { ActiveWork } from '@/features/upload/stores/use-upload-store';
import { cn } from '@/shared/utils/utils';

/**
 * Which bucket the session is working in, and how to move to another.
 *
 * Strictly a view. Discovery is `useBuckets`, and changing the active bucket is
 * `useAuth().switchBucket`, which owns the whole lifecycle - verification,
 * teardown, manager rebuild, persistence, navigation. Nothing here duplicates
 * any of it, and nothing here is a second opinion about which bucket is
 * current: that is read back from the session on every render.
 */

/** "2 uploads and 1 delete are still in progress." */
function describeActiveWork(work: ActiveWork): string {
  const parts: string[] = [];

  if (work.uploads > 0) parts.push(`${work.uploads} upload${work.uploads === 1 ? '' : 's'}`);
  if (work.deletes > 0) parts.push(`${work.deletes} delete${work.deletes === 1 ? '' : 's'}`);

  // Only reachable if the counts changed between the refusal and this call, in
  // which case saying something vague is better than saying "0 uploads".
  if (parts.length === 0) return 'Work is still in progress.';

  const verb = work.uploads + work.deletes === 1 ? 'is' : 'are';

  return `${parts.join(' and ')} ${verb} still in progress.`;
}

/**
 * Hands the menu's opening focus to the search field.
 *
 * A menu normally owns its focus, so `DropdownMenuContentProps` leaves
 * `onOpenAutoFocus` out of its public type - but the prop is spread straight
 * through to the same FocusScope that Dialog and Popover expose it on, so it
 * works. Hence the cast, which is narrow and deliberate.
 *
 * Taking focus back afterwards instead does not work, and looked like it did:
 * Radix focuses the content after the effect that would steal it, so the caret
 * ended up on the menu rather than in the field and every keystroke went to the
 * menu's typeahead - jumping between buckets instead of typing. The test
 * "puts the caret in the search field" fails if this stops working, which is
 * the point of writing it this way rather than hoping.
 */
function openFocus(target: React.RefObject<HTMLInputElement | null>) {
  return {
    onOpenAutoFocus: (event: Event) => {
      event.preventDefault();
      target.current?.focus();
    },
  } as { onOpenAutoFocus?: (event: Event) => void };
}

/**
 * Moves focus from the search field into the list.
 *
 * The menu handles arrow keys only when it is the event's own target, so an
 * input inside it is a dead end for the keyboard: the rows can be seen and
 * clicked but never reached. Focusing a row by hand is enough - the menu's
 * roving focus owns every arrow key from then on.
 */
function focusRow(from: HTMLElement, edge: 'first' | 'last'): void {
  const content = from.closest('[data-radix-menu-content]');
  const rows = content?.querySelectorAll<HTMLElement>(
    '[role="menuitemradio"]:not([data-disabled]), [role="menuitem"]:not([data-disabled])'
  );

  if (!rows || rows.length === 0) return;

  (edge === 'first' ? rows[0] : rows[rows.length - 1]).focus();
}

export function BucketSwitcher() {
  const { switchBucket } = useAuth();
  const {
    buckets,
    status,
    isLoading,
    isLoadingMore,
    error,
    isDiscoveryUnavailable,
    hasMore,
    searchTerm,
    currentBucketName,
    setSearchTerm,
    loadBuckets,
    loadMore,
    refresh,
  } = useBuckets();
  const { error: notifyError } = useNotification();

  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [manualName, setManualName] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);

  /**
   * Discovery starts here and nowhere else.
   *
   * ListBuckets is billed and the dashboard mounts this on every page, so the
   * hook stays inert until it is opened. `loadBuckets` is idempotent, so
   * reopening serves what is already loaded.
   */
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open) loadBuckets();
    },
    [loadBuckets]
  );

  const runSwitch = useCallback(
    async (bucketName: string, region: string | undefined) => {
      // One switch at a time. Step 1 refuses a concurrent one outright; this
      // just avoids making the call that would be refused.
      if (isSwitching) return;

      // Picking the bucket already open is not a switch, and must not raise the
      // "this will cancel your uploads" question for a no-op. Step 1 answers
      // `unchanged` for exactly this, but there is no reason to ask at all.
      if (bucketName === currentBucketName) {
        setIsOpen(false);
        return;
      }

      setIsSwitching(true);

      try {
        const result = await switchBucket(bucketName, region);

        if (result.status === 'blocked') {
          const confirmed = await confirmAction({
            title: `Switch to ${bucketName}?`,
            description: `${describeActiveWork(result.activeWork)}\nSwitching buckets cancels them.`,
            confirmLabel: 'Switch and cancel',
            destructive: true,
          });

          // Never retried automatically: the whole point of the refusal is that
          // a person decides whether that work can be thrown away.
          if (!confirmed) return;

          await switchBucket(bucketName, region, { discardActiveWork: true });
        }

        setIsOpen(false);
      } catch (caught) {
        // A bucket that cannot be verified leaves the session exactly as it
        // was, so the switcher stays open and usable on the bucket it is
        // already on. The classified failure names the actual problem.
        const failure = failureFrom(caught);
        notifyError(`${failure.title}. ${failure.detail}`);
      } finally {
        setIsSwitching(false);
      }
    },
    [currentBucketName, isSwitching, notifyError, switchBucket]
  );

  const handleManualSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();

      const name = manualName.trim();
      if (!name || isSwitching) return;

      // Deliberately not checked against anything first. Whether the bucket
      // exists and is readable is what `switchBucket`'s verification answers,
      // and a second opinion here would be one more thing to disagree with it.
      void runSwitch(name, undefined);
    },
    [isSwitching, manualName, runSwitch]
  );

  const label = currentBucketName ?? 'No bucket';

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title={currentBucketName ?? undefined}
          aria-label={`Current bucket: ${label}. Change bucket`}
          // Narrow enough on a phone to sit beside the menu button and the
          // wordmark without pushing either off screen; the name truncates and
          // the title attribute keeps the whole of it reachable.
          className="h-8 min-w-0 max-w-26 gap-1.5 px-2 text-foreground sm:max-w-48 md:max-w-64"
        >
          {isSwitching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Database className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-medium">{label}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] p-0"
        {...openFocus(searchRef)}
      >
        {isDiscoveryUnavailable ? (
          <form onSubmit={handleManualSubmit} className="space-y-3 p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Bucket list unavailable</p>
              {/* Says what happened without implying the session is broken: it
                  is not, and everything else still works. */}
              <p className="text-xs leading-relaxed text-muted-foreground">
                {error?.detail ?? 'These keys cannot list buckets. You can still switch by name.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="manual-bucket-name" className="text-xs font-medium text-foreground">
                Bucket name
              </label>
              <Input
                id="manual-bucket-name"
                value={manualName}
                onChange={(event) => setManualName(event.target.value)}
                placeholder="my-bucket"
                autoComplete="off"
                spellCheck={false}
                disabled={isSwitching}
                // Radix runs a typeahead on printable keys inside a menu, which
                // would swallow what is being typed here.
                onKeyDown={(event) => event.stopPropagation()}
              />
            </div>

            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={isSwitching || manualName.trim() === ''}
            >
              {isSwitching ? 'Switching...' : 'Switch bucket'}
            </Button>
          </form>
        ) : (
          <>
            <div className="border-b border-border p-2">
              <label htmlFor="bucket-search" className="sr-only">
                Search buckets
              </label>
              <Input
                id="bucket-search"
                ref={searchRef}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search buckets..."
                autoComplete="off"
                spellCheck={false}
                className="h-8"
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    // The menu only acts on arrow keys it receives itself, so
                    // from inside this field they would do nothing and the list
                    // would be unreachable without a mouse. Handing focus to
                    // the first or last row starts the menu's own roving focus,
                    // which takes every arrow key after this one.
                    event.preventDefault();
                    focusRow(event.currentTarget, event.key === 'ArrowDown' ? 'first' : 'last');
                    return;
                  }

                  // Escape closes the menu and Tab leaves it, both of which are
                  // the menu's business. Everything else is someone typing a
                  // bucket name, and must not reach the menu's typeahead - that
                  // would jump between rows instead of filling in the field.
                  if (event.key !== 'Escape' && event.key !== 'Tab') {
                    event.stopPropagation();
                  }
                }}
              />
            </div>

            <div className="max-h-64 overflow-y-auto p-1">
              {status === 'error' ? (
                <div className="space-y-2 p-2">
                  <p className="text-sm text-foreground">{error?.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{error?.detail}</p>
                  {/* Retryable failures get a retry, not the manual-entry
                      fallback: a dropped connection is not missing permission. */}
                  <Button variant="outline" size="sm" onClick={() => refresh()} className="gap-2">
                    <RefreshCw className="size-3.5" />
                    Try again
                  </Button>
                </div>
              ) : isLoading ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  Loading buckets...
                </p>
              ) : buckets.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  {searchTerm.trim() === '' ? 'No buckets found' : 'No buckets match that search'}
                </p>
              ) : (
                <DropdownMenuRadioGroup value={currentBucketName ?? ''}>
                  {buckets.map((bucket) => {
                    const isCurrent = bucket.name === currentBucketName;

                    return (
                      <DropdownMenuRadioItem
                        key={bucket.name}
                        value={bucket.name}
                        disabled={isSwitching}
                        title={bucket.name}
                        // Kept open while the switch runs, so the busy state is
                        // visible and a second row cannot be picked underneath
                        // it. Closed by hand once it succeeds.
                        onSelect={(event) => {
                          event.preventDefault();
                          void runSwitch(bucket.name, bucket.region);
                        }}
                        className="gap-2 py-2 pl-8 pr-2"
                      >
                        <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
                          {isCurrent ? <Check className="size-3.5" /> : null}
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className={cn('truncate text-sm', isCurrent && 'font-medium')}>
                            {bucket.name}
                          </span>
                          {/* Only when the provider actually said so. An
                              invented region would be passed to switchBucket
                              and rebuild the client for the wrong place. */}
                          {bucket.region ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {bucket.region}
                            </span>
                          ) : null}
                        </span>
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              )}

              {hasMore ? (
                <DropdownMenuItem
                  disabled={isLoadingMore}
                  onSelect={(event) => {
                    event.preventDefault();
                    loadMore();
                  }}
                  className="justify-center text-sm text-muted-foreground"
                >
                  {isLoadingMore ? 'Loading...' : 'Load more'}
                </DropdownMenuItem>
              ) : null}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
