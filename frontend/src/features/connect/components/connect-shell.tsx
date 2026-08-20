import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface ConnectShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}

/**
 * The frame every step of the connect flow sits in.
 *
 * A server component with no client JavaScript. Everything a crawler needs -
 * the H1, the intro paragraph, the links out to other providers - renders here
 * in the initial HTML, and only the form below it hydrates.
 *
 * Centred and narrow on purpose. This is an onboarding flow, so the page should
 * hold one decision at a time rather than presenting a wall of form.
 */
export function ConnectShell({
  eyebrow,
  title,
  subtitle,
  backHref,
  backLabel,
  children,
}: ConnectShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <Image src="/logo.png" alt="" width={28} height={28} className="h-7 w-7" priority />
            <span className="text-base font-semibold tracking-tight text-foreground">Opndrive</span>
          </Link>

          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {backLabel ?? 'Back'}
            </Link>
          ) : (
            <Link
              href="/"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to home
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            {subtitle}
          </p>
        </div>

        <div className="mt-10">{children}</div>
      </main>
    </div>
  );
}
