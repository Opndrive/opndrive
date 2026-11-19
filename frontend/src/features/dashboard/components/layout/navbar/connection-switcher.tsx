'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Cloud, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
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
import { useNotification } from '@/context/notification-context';
import type { Connection } from '@/lib/connections/connections';
import { S3_PROVIDERS, getProviderBySlug } from '@/config/providers';
import { ProviderMark } from '@/features/connect/components/provider-mark';
import { useGuardedSwitch } from './use-guarded-switch';
import {
  menuContentClass,
  menuItemClass,
} from '@/features/dashboard/components/ui/menus/menu-styles';
import { cn } from '@/shared/utils/utils';

/**
 * Which saved connection the session is on, how to move to another, and how to
 * add or forget one.
 *
 * Strictly a view, as `BucketSwitcher` is. The list and the lifecycle behind a
 * switch - verification, teardown, manager rebuild, persistence, navigation -
 * belong to `useAuth()`, and which connection is current is read back from the
 * live session on every render rather than remembered here.
 *
 * It looks and behaves like the bucket switcher on purpose: the two are a pair,
 * an account and then a bucket within it, and sit side by side in the navbar.
 */

/** The provider's mark, falling back to the neutral one for an unknown slug. */
function ConnectionMark({ connection }: { connection: Connection }) {
  const provider =
    getProviderBySlug(connection.provider) ??
    S3_PROVIDERS.find((entry) => entry.id === 'custom') ??
    S3_PROVIDERS[0]!;

  return <ProviderMark provider={provider} size="xs" />;
}

export function ConnectionSwitcher() {
  const { connections, activeConnectionId, switchConnection, removeConnection } = useAuth();
  const { error: notifyError, success: notifySuccess } = useNotification();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  // Shared with the bucket switcher: neither can start a change while the
  // other's is still being verified.
  const { isSwitching, run } = useGuardedSwitch();

  const current = connections.find((connection) => connection.id === activeConnectionId);
  const label = current?.name ?? 'No connection';

  const runSwitch = useCallback(
    async (connection: Connection) => {
      // Picking the connection already open is not a switch, and must not raise
      // the "this will cancel your uploads" question for a no-op.
      if (connection.id === current?.id) {
        setIsOpen(false);
        return;
      }

      const switched = await run({
        attempt: (discardActiveWork) => switchConnection(connection.id, { discardActiveWork }),
        confirmTitle: `Switch to ${connection.name}?`,
        change: 'Switching connections',
      });

      // A connection that cannot be verified leaves the session exactly as it
      // was, so the switcher stays open on the one it is already on. A switch
      // that lands is announced by the auth provider, whose live region is the
      // one thing the remount behind it leaves in place.
      if (switched) setIsOpen(false);
    },
    [current?.id, run, switchConnection]
  );

  const handleDelete = useCallback(
    async (connection: Connection) => {
      const confirmed = await confirmAction({
        title: `Delete ${connection.name}?`,
        description:
          'This removes the saved connection and its keys from this browser.\nYour bucket and the files in it are not touched.',
        confirmLabel: 'Delete connection',
        destructive: true,
      });

      if (!confirmed) return;

      try {
        removeConnection(connection.id);
        notifySuccess(`Deleted ${connection.name}.`);
      } catch (caught) {
        console.error('Connection removal failed', caught);
        notifyError(
          caught instanceof Error ? caught.message : 'The connection could not be deleted.'
        );
      }
    },
    [notifyError, notifySuccess, removeConnection]
  );

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title={current?.name}
          aria-label={`Current connection: ${label}. Change connection`}
          // On a phone the name is dropped and the provider mark stands for it:
          // the bucket switcher beside this already takes the room there, and
          // the full name stays one tap away in the menu and in the title.
          // From sm, where the name shows, `shrink` undoes the button's
          // shrink-0, so a long name truncates instead of pushing the rest of
          // the navbar off the screen. The mark alone never needs to.
          className="h-8 min-w-0 max-w-32 gap-2 rounded-md px-2 text-foreground data-[state=open]:bg-accent sm:max-w-52 sm:shrink md:max-w-72"
        >
          {isSwitching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : current ? (
            <ConnectionMark connection={current} />
          ) : (
            <Cloud className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="hidden truncate text-[15px] font-medium sm:inline">{label}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className={cn(
          // The same panel the bucket switcher and the overflow menus use.
          menuContentClass,
          'w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden border-0 p-0'
        )}
      >
        <div className="max-h-60 overflow-y-auto p-1.5">
          {connections.length === 0 ? (
            <div className="px-2 py-5 text-center">
              <p className="text-sm text-muted-foreground">No connections yet</p>
            </div>
          ) : (
            <DropdownMenuRadioGroup value={current?.id ?? ''}>
              {connections.map((connection) => {
                const isCurrent = connection.id === current?.id;
                const providerName = getProviderBySlug(connection.provider)?.name;

                return (
                  // The delete control is a sibling menu item rather than a
                  // button nested inside the row, for the same reason as in the
                  // bucket list: a menu's roving focus only visits its own
                  // items, so a nested button would be unreachable by keyboard.
                  <div
                    key={connection.id}
                    className="group/connection relative flex items-center rounded-md"
                  >
                    <DropdownMenuRadioItem
                      value={connection.id}
                      disabled={isSwitching}
                      title={connection.name}
                      // Kept open while the switch runs, so the busy state is
                      // visible and a second row cannot be picked underneath
                      // it. Closed by hand once it succeeds.
                      onSelect={(event) => {
                        event.preventDefault();
                        void runSwitch(connection);
                      }}
                      // The primitive puts a radio dot on the left; the tick on
                      // the right is what a context switcher uses, so its
                      // indicator slot is hidden.
                      className={cn(
                        menuItemClass,
                        'min-w-0 flex-1 gap-2.5 px-2.5 py-1.5 pr-9 [&>span:first-child]:hidden'
                      )}
                    >
                      <ConnectionMark connection={connection} />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className={cn('truncate text-[15px]', isCurrent && 'font-medium')}>
                          {connection.name}
                        </span>
                        {providerName ? (
                          <span className="truncate text-[12px] text-muted-foreground">
                            {providerName}
                          </span>
                        ) : null}
                      </span>
                    </DropdownMenuRadioItem>

                    {isCurrent ? (
                      // No delete on the connection the session is working in.
                      // Ending that one is "Clear Session", so the slot holds
                      // the tick instead.
                      <Check className="pointer-events-none absolute right-2.5 size-4 shrink-0 text-foreground" />
                    ) : (
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={isSwitching}
                        onSelect={() => void handleDelete(connection)}
                        aria-label={`Delete connection ${connection.name}`}
                        title={`Delete ${connection.name}`}
                        className={cn(
                          'absolute right-1 flex size-7 cursor-pointer items-center justify-center rounded-md p-0 transition-opacity',
                          // Out of the way until it is wanted, and visible on
                          // focus and on touch screens, exactly as the bucket
                          // rows do it.
                          'opacity-0 group-hover/connection:opacity-100',
                          'focus:opacity-100 data-[highlighted]:opacity-100',
                          '[@media(pointer:coarse)]:opacity-100'
                        )}
                      >
                        <Trash2 className="size-4" />
                      </DropdownMenuItem>
                    )}
                  </div>
                );
              })}
            </DropdownMenuRadioGroup>
          )}
        </div>

        <div className="border-t border-border/60 p-1.5">
          <DropdownMenuItem
            disabled={isSwitching}
            onSelect={() => {
              // The connect page does the rest: it verifies the keys, saves the
              // connection to the list, and opens the dashboard on it.
              setIsOpen(false);
              router.push('/connect');
            }}
            className={cn(menuItemClass, 'gap-2 px-2.5 py-1.5 text-sm')}
          >
            <Plus className="size-4 shrink-0" />
            <span className="flex-1">Add connection</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
