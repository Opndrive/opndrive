import { Check, ChevronDown, Lock } from 'lucide-react';

export type SectionState = 'complete' | 'active' | 'locked';

interface WizardSectionProps {
  index: number;
  title: string;
  state: SectionState;
  /** Short status shown on the right, e.g. the provider already chosen. */
  summary?: string;
  children?: React.ReactNode;
}

/**
 * One numbered step in the connect flow.
 *
 * The whole flow is laid out as numbered sections rather than a single form so
 * that the shape of the task is visible before you start it: three steps, this
 * is where you are, here is what is left. A locked section is still rendered
 * rather than hidden, because knowing what comes next is most of what makes an
 * onboarding flow feel short.
 *
 * Locked sections are not interactive and are not links, so there is nothing
 * here for a keyboard or a crawler to land on that would go nowhere.
 */
export function WizardSection({ index, title, state, summary, children }: WizardSectionProps) {
  const isLocked = state === 'locked';

  return (
    <section className="border-t border-border first:border-t-0">
      <div className="flex items-center gap-3 py-4">
        <StepBadge index={index} state={state} />

        <h2
          className={`flex-1 text-base font-medium ${isLocked ? 'text-muted-foreground' : 'text-foreground'}`}
        >
          {title}
        </h2>

        {state === 'complete' && summary && (
          <span className="rounded-full bg-success-surface px-2.5 py-1 text-xs font-medium text-success">
            {summary}
          </span>
        )}

        {isLocked ? (
          <Lock className="h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
        ) : (
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground ${state === 'active' ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        )}
      </div>

      {children && <div className="pb-6">{children}</div>}
    </section>
  );
}

function StepBadge({ index, state }: { index: number; state: SectionState }) {
  if (state === 'complete') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Step {index}, complete</span>
      </span>
    );
  }

  if (state === 'active') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
        {index}
        <span className="sr-only">, current step</span>
      </span>
    );
  }

  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold text-muted-foreground">
      {index}
      <span className="sr-only">, not started</span>
    </span>
  );
}
