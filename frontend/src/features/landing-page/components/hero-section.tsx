'use client';

import { assets } from '@/assets';
import { Button } from '@/shared/components/ui';
import Image from 'next/image';
import useEffectiveTheme from '@/hooks/use-effective-theme';
import ThemeToggleCustom from '@/shared/components/layout/ThemeToggleCustom';

const navItems = [
  { label: 'Home', href: '#hero' },
  { label: 'Features', href: '#features' },
  { label: 'Tools', href: '#tools' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Get Started', href: '#get-started' },
];

interface HeroSectionProps {
  handleGetStarted: () => Promise<void>;
  isLoading: boolean;
}

export default function HeroSection({ handleGetStarted, isLoading }: HeroSectionProps) {
  const effectiveTheme = useEffectiveTheme();

  return (
    <section id="hero" className="min-h-screen flex flex-col justify-center bg-background relative">
      <div className="max-w-7xl w-full mx-auto px-6 flex-1 flex items-center">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center w-full">
          <div className="space-y-6 lg:space-y-8">
            <div className="flex items-center gap-3 mb-8">
              <div className="flex items-center justify-center">
                <Image
                  src="/logo-nobg.png"
                  alt="Opndrive Logo"
                  width={32}
                  height={32}
                  className="object-contain"
                />
              </div>
              <span className="text-xl font-bold text-foreground">Opndrive</span>
            </div>

            <div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4 sm:mb-6 text-balance leading-tight">
                Your S3 storage, beautifully organized
              </h1>
              <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-lg text-pretty leading-relaxed">
                Open-source web interface for S3 compatible storage. Connect your own bucket and
                manage files with complete control over your data.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-2">
              <Button
                onClick={handleGetStarted}
                disabled={isLoading}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 sm:px-8 py-2.5 sm:py-3 text-sm sm:text-base font-medium w-full sm:w-auto text-center"
              >
                {isLoading ? 'Loading...' : 'Get Started'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const element = document.querySelector('#faq');
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="border-border text-foreground hover:bg-accent px-6 sm:px-8 py-2.5 sm:py-3 text-sm sm:text-base font-medium bg-transparent w-full sm:w-auto text-center"
              >
                Learn More
              </Button>
            </div>
          </div>

          <div className="relative mt-6 lg:mt-0">
            <div className="w-full h-56 sm:h-72 lg:h-96 flex items-center justify-center relative overflow-hidden">
              <Image
                src={
                  effectiveTheme === 'dark'
                    ? assets.DarkLandingPageHeroImg
                    : assets.LightLandingPageHeroImg
                }
                alt="opndrive-hero-image"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>
        </div>
      </div>

      {/* sentinel for navbar intersection observer */}
      <div id="hero-anchor" className="absolute left-0 right-0 bottom-0 h-2 pointer-events-none" />

      {/* Static navbar at bottom of hero section - this one shows initially */}
      <div className="w-full flex justify-center pb-8">
        {/* Static navbar visible only on large screens; kept in DOM for sticky detection */}
        <div
          id="static-navbar"
          className="hidden lg:flex bg-card/80 backdrop-blur-md border border-border rounded-full px-8 py-4 shadow-lg max-w-fit"
        >
          <div className="flex items-center gap-6 lg:gap-8">
            {navItems.map((item, index) => (
              <button
                key={index}
                onClick={() => {
                  const element = document.querySelector(item.href);
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="text-sm font-medium  text-muted-foreground hover:text-foreground transition-colors duration-200 whitespace-nowrap"
              >
                {item.label}
              </button>
            ))}
            <div className="ml-2">
              <ThemeToggleCustom />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
