'use client';

import Navbar from '@/components/landing-page/navbar';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <Navbar showAuthButtons={true} />

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
                <Button size="lg" onClick={() => router.push('/auth/signup')}>
                  Get Started for Free
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
