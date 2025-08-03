'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  useEffect(() => {
    const interval = setInterval(() => {
      const glitchElement = document.getElementById('glitch-text');
      if (glitchElement) {
        glitchElement.classList.add('glitch-active');
        setTimeout(() => {
          glitchElement.classList.remove('glitch-active');
        }, 200);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <div className="w-full max-w-lg mx-auto">
        <div className="relative mb-8">
          <h1
            id="glitch-text"
            className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black text-center leading-none tracking-tighter"
          >
            <span className="relative inline-block">
              <span className="relative z-10 text-primary">4</span>
              <span className="absolute -inset-1 bg-primary/10 blur-sm rounded-full z-0"></span>
            </span>
            <span className="relative inline-block">
              <span className="relative z-10 text-foreground">0</span>
              <span className="absolute -inset-1 bg-foreground/10 blur-sm rounded-full z-0"></span>
            </span>
            <span className="relative inline-block">
              <span className="relative z-10 text-primary">4</span>
              <span className="absolute -inset-1 bg-primary/10 blur-sm rounded-full z-0"></span>
            </span>
          </h1>

          <div className="flex items-center justify-center gap-4 my-6">
            <div className="h-px bg-border flex-1"></div>
            <div className="w-3 h-3 rounded-full bg-primary"></div>
            <div className="h-px bg-border flex-1"></div>
          </div>
        </div>

        <div className="text-center mb-12 space-y-4">
          <h2 className="text-2xl font-bold">Page Not Found</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            The page you are looking for might have been removed, had its name changed, or is
            temporarily unavailable.
          </p>
        </div>

        <div className="flex justify-center">
          <Button asChild size="lg" className="px-8">
            <Link href="/">Return to Homepage</Link>
          </Button>
        </div>
      </div>

      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent"></div>
        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent"></div>
      </div>
    </div>
  );
}
