'use client';

import * as React from 'react';

import { Button } from '@/shared/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';

export interface ConfirmOptions {
  title: string;
  /** Body copy. Newlines are preserved, so a list of names stays readable. */
  description: string;
  /** Defaults to "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Paints the confirm button red. On for deletes. */
  destructive?: boolean;
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

/**
 * Set by `ConfirmDialogHost` while it is mounted.
 *
 * A module-level handle rather than a context on purpose: the callers are
 * imperative (`if (await confirmAction(...))`), and one of them is a plain hook
 * with no JSX of its own, so there is nothing there to render a dialog from.
 * This keeps the call shape `window.confirm` had.
 */
let openConfirm: ((options: ConfirmOptions) => Promise<boolean>) | null = null;

/**
 * Asks the user to confirm something, resolving true only if they accept.
 *
 * Replaces `window.confirm`, which blocked the main thread, ignored the theme
 * and rendered as a browser security warning on mobile.
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (!openConfirm) {
    // Treated as a decline, never as an accept. If the host is missing, the
    // worst outcome is a delete that does not happen.
    console.error('[opndrive] confirmAction called with no <ConfirmDialogHost /> mounted.');
    return Promise.resolve(false);
  }
  return openConfirm(options);
}

/**
 * Renders the single confirmation dialog the app shares. Mount once, near the
 * root, above anything that can ask for a confirmation.
 */
export function ConfirmDialogHost() {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);

  // Held in a ref as well so unmount can settle a promise that is still open,
  // without making the effect depend on `pending` and re-register every time.
  const pendingRef = React.useRef<PendingConfirm | null>(null);
  pendingRef.current = pending;

  React.useEffect(() => {
    openConfirm = (options) =>
      new Promise<boolean>((resolve) => {
        setPending({ options, resolve });
      });

    return () => {
      openConfirm = null;
      // An unmount with a question still on screen is a decline, not a hang.
      pendingRef.current?.resolve(false);
    };
  }, []);

  const settle = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(null);
  };

  const options = pending?.options;

  return (
    <AlertDialog
      open={pending !== null}
      // Covers Escape and any other Radix-initiated close. Outside clicks do
      // not dismiss an alert dialog, so this cannot fire on a stray click.
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          {/* whitespace-pre-line so a caller can list item names on their own
              lines the way the old confirm() text did. */}
          <AlertDialogDescription className="whitespace-pre-line">
            {options?.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">{options?.cancelLabel ?? 'Cancel'}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant={options?.destructive ? 'destructive' : 'default'}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? 'Confirm'}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
