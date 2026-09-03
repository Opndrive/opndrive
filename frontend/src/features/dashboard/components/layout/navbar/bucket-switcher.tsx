'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
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
import { useBucketMutations } from '@/features/dashboard/hooks/use-bucket-mutations';
import { useNotification } from '@/context/notification-context';
import { failureFrom } from '@/lib/s3/connection-failure';
import {
  describeBucketNameCaveat,
  describeBucketNameError,
  isValidBucketName,
} from '@/lib/s3/bucket-name';
import type { ActiveWork } from '@/features/upload/stores/use-upload-store';
import {
  menuContentClass,
  menuItemClass,
} from '@/features/dashboard/components/ui/menus/menu-styles';
import { cn } from '@/shared/utils/utils';

/**
 * Which bucket the session is working in, how to move to another, and how to
 * make or remove one.
 *
 * Strictly a view. Discovery is `useBuckets`, creating and deleting is
 * `useBucketMutations`, and changing the active bucket is
 * `useAuth().switchBucket`, which owns that whole lifecycle - verification,
 * teardown, manager rebuild, persistence, navigation. Nothing here duplicates
 * any of it, and nothing here is a second opinion about which bucket is
 * current: that is read back from the session on every render.
 */

/**
 * Which of the two panels the menu is showing.
 *
 * `list` is the switcher proper - or, when the provider will not list buckets,
 * the name field that stands in for it. `create` is the new-bucket form. They
 * are one menu rather than a dialog because everything either panel needs is
 * already open: the list to see what the names look like, and the region the
 * session is connected to.
 */
type Panel = 'list' | 'create';

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
  const {
    region: sessionRegion,
    canChooseRegion,
    regionOptions,
    isCreating,
    deletingBucket,
    createBucket,
    deleteBucket,
  } = useBucketMutations();
  const { error: notifyError } = useNotification();

  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [panel, setPanel] = useState<Panel>('list');
  const [manualName, setManualName] = useState('');
  const [newBucketName, setNewBucketName] = useState('');
  /** Empty until the region select is touched; see `newBucketRegion` below. */
  const [newBucketRegion, setNewBucketRegion] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);

  /**
   * Focuses the create panel's field the moment it exists.
   *
   * A ref callback rather than an effect on `panel`, because "when this input
   * mounts" is exactly the event being waited for, and there is nothing to
   * synchronise. Memoised so its identity is stable: an inline callback is
   * re-run with null and then the node on every render, which would drag the
   * caret back to the start of the field on every keystroke.
   */
  const focusOnMount = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

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

      if (open) {
        loadBuckets();
        return;
      }

      // Reopening should show the list, not whatever panel was left behind,
      // and certainly not a half-typed bucket name from last time.
      setPanel('list');
      setNewBucketName('');
      setNewBucketRegion('');
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

  /**
   * What the name field currently says about itself.
   *
   * Derived on render rather than kept in state and refreshed from an onChange
   * handler: there is exactly one input, its rules are pure, and a second copy
   * of the answer is a second thing that can be stale.
   *
   * Nothing is said about an empty field. "Bucket name cannot be empty" under
   * a field nobody has typed in yet is a telling-off for having just arrived;
   * the disabled submit button already says the same thing quietly.
   */
  const pendingName = newBucketName.trim();
  const nameError = pendingName === '' ? null : describeBucketNameError(pendingName);
  const nameCaveat = nameError ? null : describeBucketNameCaveat(pendingName);

  /**
   * Where the new bucket goes: whatever was chosen, or the session's own.
   *
   * Falling back rather than seeding the state from `sessionRegion` on mount,
   * because the session is not necessarily loaded when this first renders and
   * an initial value taken then would be an empty string that never corrects
   * itself. Nothing to synchronise, so nothing here is state.
   */
  const pendingRegion = newBucketRegion || sessionRegion || '';

  const handleCreateSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (isCreating || pendingName === '' || nameError) return;

      const created = await createBucket(pendingName, pendingRegion);
      if (!created) return;

      // The list already holds the new bucket - the mutation hook put it there
      // rather than paying for another ListBuckets - but a search term left in
      // the box can still be hiding it. Cleared only when it actually would.
      if (!pendingName.toLowerCase().includes(searchTerm.trim().toLowerCase())) {
        setSearchTerm('');
      }

      setNewBucketName('');
      setNewBucketRegion('');
      setPanel('list');
    },
    [createBucket, isCreating, nameError, pendingName, pendingRegion, searchTerm, setSearchTerm]
  );

  /**
   * A search that matched nothing, but reads like a bucket name.
   *
   * Some keys can read a bucket without being allowed to list it, so a name
   * that is missing from the list is not necessarily a name that is missing.
   * This is the remaining way to reach one, now that the footer offers a new
   * bucket rather than a name field.
   */
  const typedTerm = searchTerm.trim();
  const canSwitchToTypedTerm =
    status === 'ready' && buckets.length === 0 && typedTerm !== '' && isValidBucketName(typedTerm);

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
          className="h-8 min-w-0 max-w-32 gap-2 rounded-md px-2 text-foreground data-[state=open]:bg-accent sm:max-w-52 md:max-w-72"
        >
          {isSwitching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Database className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-[15px] font-medium">{label}</span>
          {/* The stacked pair rather than a single caret: this opens a list to
              move between, not a disclosure that expands downwards. */}
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className={cn(
          // The same panel the file and folder overflow menus use, so every
          // menu in the app is one surface. Its border is dropped: on the dark
          // theme the outline reads as a pale box drawn around the menu.
          menuContentClass,
          'w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden border-0 p-0'
        )}
        {...openFocus(searchRef)}
      >
        {panel === 'create' ? (
          <form onSubmit={handleCreateSubmit} className="space-y-3 p-3">
            <p className="text-[15px] font-medium text-foreground">New bucket</p>

            <div className="space-y-1.5">
              <label htmlFor="new-bucket-name" className="text-[13px] font-medium text-foreground">
                Bucket name
              </label>
              <Input
                id="new-bucket-name"
                ref={focusOnMount}
                value={newBucketName}
                onChange={(event) => setNewBucketName(event.target.value)}
                placeholder="my-bucket"
                autoComplete="off"
                spellCheck={false}
                disabled={isCreating}
                aria-invalid={nameError !== null}
                aria-describedby={nameError || nameCaveat ? 'new-bucket-name-hint' : undefined}
                // Radix runs a typeahead on printable keys inside a menu, which
                // would swallow what is being typed here.
                onKeyDown={(event) => event.stopPropagation()}
              />
              {/* One line, whichever applies: a rule that has been broken, or
                  the one legal choice worth warning about. */}
              {nameError || nameCaveat ? (
                <p
                  id="new-bucket-name-hint"
                  className={cn(
                    'text-[12px] leading-relaxed',
                    nameError ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {nameError ?? nameCaveat}
                </p>
              ) : (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Lowercase letters, numbers and hyphens. 3 to 63 characters.
                </p>
              )}
            </div>

            {canChooseRegion ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="new-bucket-region"
                  className="text-[13px] font-medium text-foreground"
                >
                  Region
                </label>
                {/* A native select rather than the app's Combobox. The menu
                    clips its own overflow, so an absolutely positioned panel
                    inside it would be cut off, and a listbox nested in a menu
                    fights the menu for the arrow keys. The browser's own popup
                    is drawn outside all of that, and on a phone it is the
                    system picker. */}
                <select
                  id="new-bucket-region"
                  value={pendingRegion}
                  onChange={(event) => setNewBucketRegion(event.target.value)}
                  disabled={isCreating}
                  // As with the name field: printable keys are for choosing a
                  // region, not for the menu's typeahead.
                  onKeyDown={(event) => event.stopPropagation()}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
                >
                  {regionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  A bucket lives in one region for good. It cannot be moved later.
                </p>
              </div>
            ) : (
              // Every provider but AWS stores a resolved endpoint, and that URL
              // decides the location - offering a list here would be offering a
              // choice the request cannot honour.
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                {sessionRegion
                  ? `Created in ${sessionRegion}. Your provider's endpoint sets the location, so it cannot be chosen here.`
                  : 'Created in the region this session is connected to.'}
              </p>
            )}

            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={isCreating || pendingName === '' || nameError !== null}
            >
              {isCreating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create bucket'
              )}
            </Button>

            <button
              type="button"
              onClick={() => setPanel('list')}
              disabled={isCreating}
              className="flex w-full items-center justify-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <ArrowLeft className="size-3.5" />
              {isDiscoveryUnavailable ? 'Back' : 'Back to the list'}
            </button>
          </form>
        ) : isDiscoveryUnavailable ? (
          <form onSubmit={handleManualSubmit} className="space-y-3 p-3">
            <div className="space-y-1">
              <p className="text-[15px] font-medium text-foreground">Bucket list unavailable</p>
              {/* Says what happened without implying the session is broken: it
                  is not, and everything else still works. */}
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {error?.detail ?? 'These keys cannot list buckets. You can still switch by name.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="manual-bucket-name"
                className="text-[13px] font-medium text-foreground"
              >
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

            {/* Creating one needs no listing permission at all, so it is still
                on offer here even though the list beside it is not. */}
            <button
              type="button"
              onClick={() => setPanel('create')}
              disabled={isSwitching}
              className="flex w-full items-center justify-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              New bucket
            </button>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-border/60 px-2.5">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <label htmlFor="bucket-search" className="sr-only">
                Search buckets
              </label>
              <Input
                id="bucket-search"
                ref={searchRef}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Find bucket..."
                autoComplete="off"
                spellCheck={false}
                // Undressed on purpose: the panel's own border is the frame, so
                // a second one around the field would box it twice.
                className="h-10 border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent md:text-[15px]"
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

            <div className="max-h-60 overflow-y-auto p-1.5">
              {status === 'error' ? (
                <div className="space-y-2 p-2">
                  <p className="text-[15px] text-foreground">{error?.title}</p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {error?.detail}
                  </p>
                  {/* Retryable failures get a retry, not the manual-entry
                      fallback: a dropped connection is not missing permission. */}
                  <Button variant="outline" size="sm" onClick={() => refresh()} className="gap-2">
                    <RefreshCw className="size-3.5" />
                    Try again
                  </Button>
                </div>
              ) : isLoading ? (
                <p className="px-2 py-5 text-center text-sm text-muted-foreground">
                  Loading buckets...
                </p>
              ) : buckets.length === 0 ? (
                <div className="px-2 py-5 text-center">
                  <p className="text-sm text-muted-foreground">
                    {typedTerm === '' ? 'No buckets found' : 'No buckets match that search'}
                  </p>
                </div>
              ) : (
                <DropdownMenuRadioGroup value={currentBucketName ?? ''}>
                  {buckets.map((bucket) => {
                    const isCurrent = bucket.name === currentBucketName;
                    const isDeleting = deletingBucket === bucket.name;

                    return (
                      // The delete control is a sibling menu item rather than a
                      // button nested inside the row. A menu's roving focus
                      // only visits its own items, so a nested button would be
                      // clickable and unreachable by keyboard; as a sibling it
                      // takes its turn in the arrow order like everything else.
                      <div
                        key={bucket.name}
                        className="group/bucket relative flex items-center rounded-md"
                      >
                        <DropdownMenuRadioItem
                          value={bucket.name}
                          disabled={isSwitching || isDeleting}
                          title={bucket.name}
                          // Kept open while the switch runs, so the busy state
                          // is visible and a second row cannot be picked
                          // underneath it. Closed by hand once it succeeds.
                          onSelect={(event) => {
                            event.preventDefault();
                            void runSwitch(bucket.name, bucket.region);
                          }}
                          // The primitive puts a radio dot on the left; the tick
                          // on the right is what a context switcher uses, so its
                          // indicator slot is hidden rather than left to collide
                          // with the name.
                          className={cn(
                            menuItemClass,
                            'min-w-0 flex-1 gap-2 px-2.5 py-1.5 pr-9 [&>span:first-child]:hidden'
                          )}
                        >
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span
                              className={cn('truncate text-[15px]', isCurrent && 'font-medium')}
                            >
                              {bucket.name}
                            </span>
                            {/* Only when the provider actually said so. An
                                invented region would be passed to switchBucket
                                and rebuild the client for the wrong place. */}
                            {bucket.region ? (
                              <span className="truncate text-[12px] text-muted-foreground">
                                {bucket.region}
                              </span>
                            ) : null}
                          </span>
                        </DropdownMenuRadioItem>

                        {isCurrent ? (
                          // No delete on the bucket the session is working in.
                          // Removing it would leave every later request
                          // addressing something that is not there, so the slot
                          // holds the tick instead.
                          <Check className="pointer-events-none absolute right-2.5 size-4 shrink-0 text-foreground" />
                        ) : (
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={isSwitching || isDeleting}
                            onSelect={() => void deleteBucket(bucket.name)}
                            aria-label={`Delete bucket ${bucket.name}`}
                            title={`Delete ${bucket.name}`}
                            className={cn(
                              'absolute right-1 flex size-7 cursor-pointer items-center justify-center rounded-md p-0 transition-opacity',
                              // Out of the way until it is wanted. A row in a
                              // switcher is a place to go, not a row of
                              // controls, and a trash can on every line reads
                              // as a management screen.
                              'opacity-0 group-hover/bucket:opacity-100',
                              // Focus counts as wanting it, so the keyboard
                              // never lands on something invisible.
                              'focus:opacity-100 data-[highlighted]:opacity-100',
                              // A touch screen has no hover to reveal it with,
                              // so there it simply stays visible.
                              '[@media(pointer:coarse)]:opacity-100'
                            )}
                          >
                            {isDeleting ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </DropdownMenuItem>
                        )}
                      </div>
                    );
                  })}
                </DropdownMenuRadioGroup>
              )}

              {canSwitchToTypedTerm ? (
                <DropdownMenuItem
                  disabled={isSwitching}
                  onSelect={(event) => {
                    event.preventDefault();
                    void runSwitch(typedTerm, undefined);
                  }}
                  className={cn(menuItemClass, 'justify-center px-2.5 py-1.5 text-sm')}
                >
                  <span className="truncate">
                    Switch to <span className="font-medium">{typedTerm}</span> anyway
                  </span>
                </DropdownMenuItem>
              ) : null}

              {hasMore ? (
                <DropdownMenuItem
                  disabled={isLoadingMore}
                  onSelect={(event) => {
                    event.preventDefault();
                    loadMore();
                  }}
                  className={cn(
                    menuItemClass,
                    'justify-center px-2.5 py-1.5 text-sm text-muted-foreground'
                  )}
                >
                  {isLoadingMore ? 'Loading...' : 'Load more'}
                </DropdownMenuItem>
              ) : null}
            </div>

            <div className="border-t border-border/60 p-1.5">
              <DropdownMenuItem
                disabled={isSwitching}
                onSelect={(event) => {
                  event.preventDefault();
                  setPanel('create');
                }}
                className={cn(menuItemClass, 'gap-2 px-2.5 py-1.5 text-sm')}
              >
                <Plus className="size-4 shrink-0" />
                <span className="flex-1">New bucket</span>
              </DropdownMenuItem>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
