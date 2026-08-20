import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';
import { ConnectNotice } from './connect-notice';

/** The three things someone does, in order, to get into their bucket. */
export const CONNECT_STEPS = ['Choose provider', 'Add credentials', 'Open your drive'] as const;

interface ConnectShellProps {
  /** 1-based. Steps before it read as done, steps after it as not started. */
  currentStep: number;
  title: string;
  subtitle: string;
  backHref?: string;
  backLabel?: string;
  /** One-line reassurance under the intro. Omitted where it would repeat. */
  notice?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The frame the whole connect flow sits in.
 *
 * A server component with no client JavaScript. The heading, the intro and the
 * links out to every provider all render in the initial HTML, and only the form
 * further down hydrates. These pages exist to be found, so what a crawler gets
 * on the first response has to be the real page.
 *
 * The rail on the left is the reason this reads as a short flow rather than a
 * long form: three steps, visible from the start, with the current one marked.
 */
export function ConnectShell({
  currentStep,
  title,
  subtitle,
  backHref,
  backLabel,
  notice,
  children,
}: ConnectShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <Image src="/logo.png" alt="" width={28} height={28} className="h-7 w-7" priority />
            <span className="text-base font-semibold tracking-tight text-foreground">Opndrive</span>
          </Link>

          <Link
            href={backHref ?? '/'}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {backLabel ?? 'Back to home'}
          </Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[13rem_1fr] lg:gap-14">
        <StepRail currentStep={currentStep} />

        <main className="min-w-0">
          <div className="mb-7">
            <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
            {notice && <ConnectNotice>{notice}</ConnectNotice>}
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * The vertical progress rail.
 *
 * Hidden below the large breakpoint: on a phone the numbered sections in the
 * main column already carry the same information, and a second copy of it would
 * push the actual task off screen.
 */
function StepRail({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Progress" className="hidden lg:block">
      <ol className="relative">
        {CONNECT_STEPS.map((label, index) => {
          const step = index + 1;
          const isComplete = step < currentStep;
          const isCurrent = step === currentStep;
          const isLast = index === CONNECT_STEPS.length - 1;

          return (
            <li key={label} className="relative flex gap-3 pb-7 last:pb-0">
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[0.4375rem] top-5 h-[calc(100%-1.25rem)] border-l-2 border-dotted ${
                    isComplete ? 'border-success' : 'border-step-track'
                  }`}
                />
              )}

              <span className="relative mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {isComplete ? (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-success text-success-foreground">
                    <Check className="h-2.5 w-2.5" aria-hidden="true" />
                  </span>
                ) : (
                  <span
                    className={`h-3.5 w-3.5 rounded-full border-2 ${
                      isCurrent
                        ? 'border-primary bg-background'
                        : 'border-step-pending-border bg-background'
                    }`}
                  />
                )}
              </span>

              <span
                className={`text-sm leading-none ${
                  isCurrent
                    ? 'font-medium text-primary'
                    : isComplete
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                }`}
              >
                {label}
                {isCurrent && <span className="sr-only"> (current step)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
