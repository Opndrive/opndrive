import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LEGAL_LAST_UPDATED, formatLegalDate } from '@/config/legal';

interface LegalLayoutProps {
  title: string;
  summary: string;
  children: React.ReactNode;
}

/**
 * Shared shell for the privacy policy and the terms.
 *
 * A server component with no client JavaScript: these pages are prose, and
 * they should render and be indexable without hydrating anything.
 */
export function LegalLayout({ title, summary, children }: LegalLayoutProps) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Opndrive
        </Link>

        <header className="mt-8 border-b border-border pb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{summary}</p>
          <p className="mt-6 text-sm text-muted-foreground">
            Last updated{' '}
            <time dateTime={LEGAL_LAST_UPDATED}>{formatLegalDate(LEGAL_LAST_UPDATED)}</time>
          </p>
        </header>

        <div className="mt-10 space-y-12">{children}</div>

        <footer className="mt-16 border-t border-border pt-8 text-sm text-muted-foreground">
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/privacy" className="transition-colors hover:text-foreground">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms of Service
            </Link>
            <Link href="/privacy#storage" className="transition-colors hover:text-foreground">
              Cookies and storage
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}

interface LegalSectionProps {
  id: string;
  heading: string;
  children: React.ReactNode;
}

/** One numbered-anchor section. The id is what footer links point at. */
export function LegalSection({ id, heading, children }: LegalSectionProps) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{heading}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
        {children}
      </div>
    </section>
  );
}

/** Callout for the points that matter more than the prose around them. */
export function LegalHighlight({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm leading-relaxed text-foreground">
      {children}
    </div>
  );
}
