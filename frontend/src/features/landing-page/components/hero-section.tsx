'use client';

import { assets } from '@/assets';
import { Button } from '@/shared/components/ui';
import Image from 'next/image';
import useEffectiveTheme from '@/hooks/use-effective-theme';
import ThemeToggleCustom from '@/shared/components/layout/ThemeToggleCustom';
import { FaGithub } from 'react-icons/fa';
import { useOpndriveStars } from '@/hooks/use-github-stars';

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

  // Use custom hook for GitHub stars
  const { stars } = useOpndriveStars();

  return (
    <section
      id="hero"
      className="min-h-screen flex flex-col justify-center bg-background relative overflow-hidden"
    >
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex-1 flex items-center py-8 sm:py-12 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center w-full">
          <div className="space-y-4 sm:space-y-6 lg:space-y-8 text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-2 sm:gap-3 mb-4 sm:mb-6 lg:mb-8">
              <div className="flex items-center justify-center">
                <Image
                  src="/logo-nobg.png"
                  alt="Opndrive Logo"
                  width={28}
                  height={28}
                  className="object-contain sm:w-8 sm:h-8"
                  priority
                />
              </div>
              <span className="text-lg sm:text-xl font-bold text-foreground">Opndrive</span>
            </div>

            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold text-foreground mb-3 sm:mb-4 text-balance leading-tight">
                <span className="block">Buckets made beautiful</span>
                <span
                  className="block text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl mt-1 sm:mt-2"
                  style={{ color: 'var(--primary)' }}
                >
                  Across every provider
                </span>
              </h1>
              <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-none lg:max-w-lg text-pretty leading-relaxed mt-4 sm:mt-6 mx-auto lg:mx-0">
                Open-source web interface for S3 compatible storage. Connect your own bucket and
                manage files with complete control over your data.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mt-6 sm:mt-8 justify-center lg:justify-start">
              <Button
                onClick={handleGetStarted}
                disabled={isLoading}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 sm:px-8 lg:px-10 py-3 sm:py-3.5 lg:py-4 text-sm sm:text-base lg:text-lg font-medium w-full sm:w-auto text-center min-w-[140px] sm:min-w-[160px]"
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
                className="border-border text-foreground hover:bg-accent px-6 sm:px-8 lg:px-10 py-3 sm:py-3.5 lg:py-4 text-sm sm:text-base lg:text-lg font-medium bg-transparent w-full sm:w-auto text-center min-w-[140px] sm:min-w-[160px]"
              >
                Learn More
              </Button>
            </div>
          </div>

          <div className="relative mt-8 sm:mt-12 lg:mt-0">
            <div className="w-full h-48 xs:h-56 sm:h-72 md:h-80 lg:h-96 xl:h-[28rem] flex items-center justify-center relative overflow-hidden">
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
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 45vw"
              />
            </div>
          </div>
        </div>
      </div>

      {/* sentinel for navbar intersection observer */}
      <div id="hero-anchor" className="absolute left-0 right-0 bottom-0 h-2 pointer-events-none" />

      {/* Static navbar at bottom of hero section - this one shows initially */}
      <div className="w-full flex justify-center pb-4 sm:pb-6 lg:pb-8 px-4">
        {/* Static navbar visible only on large screens; kept in DOM for sticky detection */}
        <div
          id="static-navbar"
          className="hidden lg:flex bg-card/80 backdrop-blur-md border border-border rounded-full px-6 lg:px-8 py-3 lg:py-4 shadow-lg max-w-fit"
        >
          <div className="flex items-center gap-4 lg:gap-6 xl:gap-8">
            {navItems.map((item, index) => (
              <button
                key={index}
                onClick={() => {
                  const element = document.querySelector(item.href);
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="text-xs lg:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 whitespace-nowrap"
              >
                {item.label}
              </button>
            ))}

            <div className="flex items-center gap-2 lg:gap-3 ml-1 lg:ml-2">
              {/* GitHub Star Button */}
              <a
                href="https://github.com/opndrive/opndrive"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 lg:gap-2 px-1.5 lg:px-2 py-1 transition-colors duration-200 group"
                style={{
                  color: 'var(--muted-foreground)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--foreground)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--muted-foreground)';
                }}
              >
                <FaGithub className="w-4 lg:w-5 h-4 lg:h-5 group-hover:scale-110 transition-transform duration-200" />
                {stars !== null && (
                  <span
                    className="text-xs lg:text-sm font-medium tabular-nums"
                    style={{
                      color: 'inherit',
                    }}
                  >
                    {stars.toLocaleString()}
                  </span>
                )}
                {stars === null && (
                  <div
                    className="w-5 lg:w-6 h-3 lg:h-4 rounded animate-pulse"
                    style={{ backgroundColor: 'var(--muted)' }}
                  />
                )}
              </a>

              <ThemeToggleCustom />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
