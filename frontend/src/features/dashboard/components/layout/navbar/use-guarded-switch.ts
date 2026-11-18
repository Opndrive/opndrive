'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useNotification } from '@/context/notification-context';
import { confirmAction } from '@/shared/components/ui/confirm-dialog';
import { failureFrom } from '@/lib/s3/connection-failure';
import type { ActiveWork } from '@/features/upload/stores/use-upload-store';

/** "2 uploads and 1 delete are still in progress." */
export function describeActiveWork(work: ActiveWork): string {
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
 * The running work and what the change does to it:
 * "1 upload is still in progress.\nSwitching buckets cancels it."
 */
export function describeCancellation(work: ActiveWork, change: string): string {
  const pronoun = work.uploads + work.deletes > 1 ? 'them' : 'it';

  return `${describeActiveWork(work)}\n${change} cancels ${pronoun}.`;
}

/** Every answer a session change gives that is not "done". */
type GuardedOutcome =
  | { status: 'blocked'; activeWork: ActiveWork }
  | { status: 'busy' }
  | { status: 'cancelled' }
  | { status: string };

export interface GuardedSwitchRequest {
  /** Runs the change; `discardActiveWork` is true only after the user agreed. */
  attempt: (discardActiveWork: boolean) => Promise<GuardedOutcome>;
  /** The question asked when running work would be cancelled: "Switch to X?" */
  confirmTitle: string;
  /** What is being done, for "Switching buckets cancels them." */
  change: string;
}

/**
 * The one way a navbar switcher changes the session.
 *
 * The bucket switcher and the connection switcher sit side by side and do the
 * same dance: try the change, and if uploads or deletes are running, ask
 * before trying again with them discarded. One hook, so a fix to that flow
 * cannot land in one switcher and not the other.
 *
 * `isSwitching` is true while either switcher (or a connect) is changing the
 * session, from the shared flag in the auth context, so neither can start a
 * change while the other's is still being verified.
 *
 * Resolves true when the session changed or was already there, false when it
 * did not (declined, refused, superseded or failed - a failure is reported).
 */
export function useGuardedSwitch() {
  const { isSwitchingSession } = useAuth();
  const { error: notifyError } = useNotification();
  const [isRunning, setIsRunning] = useState(false);

  const isSwitching = isRunning || isSwitchingSession;

  const run = useCallback(
    async ({ attempt, confirmTitle, change }: GuardedSwitchRequest): Promise<boolean> => {
      if (isSwitching) return false;

      setIsRunning(true);

      try {
        let outcome = await attempt(false);

        if (outcome.status === 'blocked' && 'activeWork' in outcome) {
          const confirmed = await confirmAction({
            title: confirmTitle,
            description: describeCancellation(outcome.activeWork, change),
            confirmLabel: 'Switch and cancel',
            destructive: true,
          });

          // Never retried automatically: the whole point of the refusal is that
          // a person decides whether that work can be thrown away.
          if (!confirmed) return false;

          outcome = await attempt(true);
        }

        // Another change got there first, or the session was cleared while this
        // one was being checked. Either way there is nothing to report as an
        // error: the session is what the user last asked for.
        if (outcome.status === 'busy' || outcome.status === 'cancelled') return false;

        return true;
      } catch (caught) {
        // A target that cannot be verified leaves the session exactly as it
        // was. The classified failure names the actual problem.
        const failure = failureFrom(caught);
        notifyError(`${failure.title}. ${failure.detail}`);
        return false;
      } finally {
        setIsRunning(false);
      }
    },
    [isSwitching, notifyError]
  );

  return { isSwitching, run };
}
