'use client';

import '@/app/globals.css';
import { useEffect } from 'react';

/**
 * Last resort. This one replaces the root layout, so it has to bring its own
 * html, body and stylesheet, and it cannot rely on any provider - the root
 * layout failing is exactly the case it exists for. Everything here is plain
 * markup for that reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Root layout render error:', error);
  }, [error]);

  useEffect(() => {
    // The theme script in the root layout never ran, so an explicit choice
    // would otherwise be lost here. Without a stored one the stylesheet still
    // follows prefers-color-scheme.
    try {
      const theme = localStorage.getItem('ui-theme');
      if (theme === 'dark' || theme === 'light') {
        document.documentElement.setAttribute('data-theme', theme);
      }
    } catch {
      // Storage can be blocked, in which case the system preference is fine
    }
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
          <div className="w-full max-w-md text-center">
            <h1 className="mb-3 text-2xl font-bold">Opndrive could not start</h1>

            <p className="mb-8 text-muted-foreground">
              The app hit an error while loading. Reloading usually clears it. Your files are
              untouched.
            </p>

            {/* Retrying re-renders the same root layout, which is often still
                broken, so a hard reload is offered next to it */}
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <button
                onClick={reset}
                className="cursor-pointer rounded-md bg-primary px-8 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="cursor-pointer rounded-md border border-border px-8 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Reload the page
              </button>
            </div>

            {error.digest && (
              <p className="mt-8 text-xs text-muted-foreground">Reference: {error.digest}</p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
