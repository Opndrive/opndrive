'use client';

import { useState } from 'react';
import Navbar from '@/components/landing-page/navbar';
import { Button } from '@/shared/components/ui';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleGetStarted = async () => {
    setIsLoading(true);

    try {
      // Small delay to show loading state for better UX
      await new Promise((resolve) => setTimeout(resolve, 300));

      const stored = localStorage.getItem('s3_user_session');
      if (stored) {
        // Already logged in → go to dashboard
        router.push('/dashboard');
      } else {
        // No session → go to connect page
        router.push('/connect');
      }
    } catch (error) {
      console.error('Error during navigation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Navbar />

      <main className="flex-1">
        <section className="w-full py-24 md:py-32 lg:py-40">
          <div className="container mx-auto px-4 text-center md:px-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="max-w-3xl space-y-3">
                <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl">
                  Your Secure, Open-Source Cloud Storage
                </h1>
                <p className="text-lg text-muted-foreground md:text-xl">
                  Opndrive offers a powerful, AI-enhanced platform for seamless file sharing and
                  collaboration, giving you full control over your data.
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-4 min-[400px]:flex-row">
                <Button
                  size="lg"
                  onClick={handleGetStarted}
                  disabled={isLoading}
                  className="cursor-pointer"
                >
                  {isLoading ? 'Getting started...' : 'Get Started'}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="flex items-center justify-center border-t border-border bg-secondary py-4">
        <p className="text-sm text-secondary-foreground">
          &copy; {new Date().getFullYear()} Opndrive. All Rights Reserved.
        </p>
      </footer>
    </div>
  );
}
