'use client';

import Image from 'next/image';
import { useState, useEffect, useRef, useCallback } from 'react';
import { assets } from '@/assets';

type FeatureId = 'oneplace' | 'integrations' | 'filetypes';

const features: {
  id: FeatureId;
  title: string;
  description: string;
  imageAlt: string;
}[] = [
  {
    id: 'oneplace',
    title: 'One place for all storage',
    description: 'Connect your personal and cloud storage, and view everything in one place.',
    imageAlt: 'Dashboard showing unified storage view',
  },
  {
    id: 'integrations',
    title: 'Integrate with many providers',
    description:
      'OpenDrive works with popular storage services so you can use what you already have.',
    imageAlt: 'Logos of supported storage providers',
  },
  {
    id: 'filetypes',
    title: 'Store any file type securely',
    description: 'From photos, documents, videos to code—upload, preview, and protect them all.',
    imageAlt: 'Illustration showing multiple file types',
  },
];

const featureImages: Record<FeatureId, { light: string; dark: string }> = {
  oneplace: {
    light: assets.LightOneplace.src,
    dark: assets.DarkOneplace.src,
  },
  integrations: {
    light: assets.LightIntegrations.src,
    dark: assets.DarkIntegrations.src,
  },
  filetypes: {
    light: assets.LightFileTypes.src,
    dark: assets.DarkFileTypes.src,
  },
};

/** How long each feature holds before the next one takes over. */
const ROTATE_INTERVAL_MS = 6000;

export default function FeaturesSection() {
  const [activeFeature, setActiveFeature] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Stable, so the effect below can name them as dependencies honestly.
   *
   * As plain functions they were rebuilt on every render, so listing them would
   * have torn the interval down and restarted it each time - which is why the
   * effect omitted them, and why the linter objected. Neither reads anything
   * that changes but the motion preference.
   */
  const stopRotation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startRotation = useCallback(() => {
    if (prefersReducedMotion) return;
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      if (!pausedRef.current) setActiveFeature((prev) => (prev + 1) % features.length);
    }, ROTATE_INTERVAL_MS);
  }, [prefersReducedMotion]);

  useEffect(() => {
    startRotation();
    return () => stopRotation();
  }, [startRotation, stopRotation]);

  const handleFeatureClick = (index: number) => {
    setActiveFeature(index);
    stopRotation();
    startRotation();
  };

  const handleMouseEnter = () => {
    pausedRef.current = true;
  };
  const handleMouseLeave = () => {
    pausedRef.current = false;
  };
  const handleFocus = () => {
    pausedRef.current = true;
  };
  const handleBlur = () => {
    pausedRef.current = false;
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleFeatureClick(index);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (activeFeature + 1) % features.length;
      setActiveFeature(next);
      stopRotation();
      startRotation();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (activeFeature - 1 + features.length) % features.length;
      setActiveFeature(prev);
      stopRotation();
      startRotation();
    }
  };

  const active = features[activeFeature];

  return (
    <section id="features" className="py-12 sm:py-16 md:py-20 lg:py-24 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12 md:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-3 sm:mb-4 md:mb-6">
            Store & Secure Everything
          </h2>
          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            Keep all your files safe, backed up, and easy to access from any device.
          </p>
        </div>

        <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center">
          {/* Feature list - Full width on mobile/tablet, left column on desktop */}
          <div
            className="space-y-4 sm:space-y-6 md:space-y-8 lg:space-y-6"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onFocus={handleFocus}
            onBlur={handleBlur}
          >
            {features.map((feature, index) => {
              const isActive = activeFeature === index;
              return (
                <div
                  key={feature.id}
                  onClick={() => handleFeatureClick(index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isActive}
                  className={`cursor-pointer transition-all duration-300 ease-out ${
                    isActive
                      ? 'border-l-4 border-primary pl-4 sm:pl-6'
                      : 'border-l-4 pl-4 sm:pl-6 border-muted'
                  }`}
                >
                  <h3
                    className={`text-lg sm:text-xl md:text-2xl font-semibold mb-2 sm:mb-3 transition-colors duration-300 ease-out ${
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {feature.title}
                  </h3>

                  {isActive && (
                    <p className="text-sm sm:text-base md:text-lg text-muted-foreground leading-relaxed animate-in fade-in duration-500">
                      {feature.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right: Image - Hidden on mobile/tablet, visible from lg screens */}
          <div className="hidden lg:flex justify-center lg:justify-end">
            <div className="w-full max-w-sm lg:max-w-md xl:max-w-lg h-72 lg:h-80 xl:h-96 overflow-hidden">
              <div className="relative w-full h-full">
                {/* Both themes ship; CSS paints one. See .theme-light-only in
                    globals.css for why this cannot be a src chosen in JS. The
                    same alt sits on both: the hidden one is display:none and so
                    out of the accessibility tree. */}
                <Image
                  key={`${active.id}-light`}
                  src={featureImages[active.id].light}
                  alt={active.imageAlt}
                  fill
                  sizes="(min-width: 1280px) 512px, (min-width: 1024px) 448px, 384px"
                  className="object-contain transition-opacity duration-500 theme-light-only"
                />
                <Image
                  key={`${active.id}-dark`}
                  src={featureImages[active.id].dark}
                  alt={active.imageAlt}
                  fill
                  sizes="(min-width: 1280px) 512px, (min-width: 1024px) 448px, 384px"
                  className="object-contain transition-opacity duration-500 theme-dark-only"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
