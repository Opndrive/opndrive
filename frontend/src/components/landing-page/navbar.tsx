'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Define the props for the Navbar component
interface NavbarProps {
  showAuthButtons?: boolean;
}

// Set default props
const defaultProps: NavbarProps = {
  showAuthButtons: true,
};

export default function Navbar(props: NavbarProps) {
  const { showAuthButtons } = { ...defaultProps, ...props };
  const router = useRouter();

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-sm sm:px-6">
      <Link href="/" className="flex items-center gap-2 text-xl font-bold">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg text-primary-foreground">
          <img src="/logo-nobg.png" alt="Opndrive Logo" className="h-9 w-9 object-contain" />
        </div>
        <span className="hidden sm:inline">Opndrive</span>
      </Link>

      {showAuthButtons && (
        <nav className="flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" onClick={() => router.push('/auth/login')}>
            Log in
          </Button>
          <Button onClick={() => router.push('/auth/signup')}>Try for free</Button>
        </nav>
      )}
    </header>
  );
}
