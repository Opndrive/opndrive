'use client';

import Link from 'next/link';

export default function Navbar() {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-sm sm:px-6">
      <Link href="/" className="flex items-center gap-2 text-xl font-bold">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg text-primary-foreground">
          <img src="/logo-nobg.png" alt="Opndrive Logo" className="h-9 w-9 object-contain" />
        </div>
        <span className="hidden sm:inline">Opndrive</span>
      </Link>
    </header>
  );
}
