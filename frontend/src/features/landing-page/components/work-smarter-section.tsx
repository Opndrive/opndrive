'use client';

import Image from 'next/image';
import { useState, useEffect, useRef, useCallback } from 'react';
import { assets } from '@/assets';

type FeatureId = 'upload' | 'search' | 'preview' | 'share';

const features: {
  id: FeatureId;
  title: string;
  description: string;
  imageAlt: string;
}[] = [
  {
    id: 'upload',
    title: 'Upload without friction',
    description: 'Upload files or whole folders easily, with versioning and backup built in.',
    imageAlt: 'Upload files and folders preview',
  },
  {
    id: 'search',
    title: 'Find files fast',
    description: 'Smart search and suggested folders mean less time looking, more time using.',
    imageAlt: 'Search interface showing file results',
  },
  {
    id: 'preview',
    title: 'Preview inside drive',
    description: 'View or edit documents, code, or media without downloading.',
    imageAlt: 'Preview of a document inside Opndrive',
  },
  {
    id: 'share',
    title: 'Secure sharing & permissions',
    description: 'Share files and set link expiry, permissions, and collaboration options.',
    imageAlt: 'Sharing options with expiry and permissions',
  },
];

const featureImages: Record<FeatureId, { light: string; dark: string }> = {
  upload: {
    light: assets.LightUpload.src,
    dark: assets.DarkUpload.src,
  },
  search: {
    light: assets.LightSearch.src,
    dark: assets.DarkSearch.src,
  },
  preview: {
    light: assets.LightPreview.src,
    dark: assets.DarkPreview.src,
  },
  share: {
    light: assets.LightShare.src,
    dark: assets.DarkShare.src,
  },
};

/** How long each feature holds before the next one takes over. */
const ROTATE_INTERVAL_MS = 6000;

export default function WorkSmarterSection() {
  const [activeFeature, setActiveFeature] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);

  /**
   * Stable, so the effect below can name them as dependencies honestly.
   *
   * As plain functions they were rebuilt on every render, so listing them would
   * have torn the interval down and restarted it each time - which is why the
   * effect omitted them, and why the linter objected. Neither reads anything
   * that changes between renders.
   */
  const stopRotation = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /**
   * The one place that decides whether rotating is appropriate at all, so a
   * click or an arrow key cannot start a timer the effect below would not have.
   *
   * Narrower than `lg` the image column beside this list is `hidden`, which
   * left the timer with nothing to change but the paragraph a reader was in the
   * middle of - and the pause is bound to hover, which a touch device never
   * fires, so on a phone there was no way to stop it. Read at call time rather
   * than during render, where it ran on every pass and never noticed the
   * preference changing.
   */
  const startRotation = useCallback(() => {
    if (intervalRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(min-width: 1024px)').matches) return;
    intervalRef.current = setInterval(() => {
      if (!pausedRef.current) setActiveFeature((prev) => (prev + 1) % features.length);
    }, ROTATE_INTERVAL_MS);
  }, []);

  /**
   * Run only while the section is actually on screen. It used to tick for as
   * long as the tab stayed open, redrawing a section the reader had left
   * behind every six seconds and remounting both of its images each time.
   */
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) startRotation();
      else stopRotation();
    });
    observer.observe(section);

    return () => {
      observer.disconnect();
      stopRotation();
    };
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
    <section ref={sectionRef} id="tools" className="bg-background py-12 sm:py-16 md:py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12 md:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-3 sm:mb-4 md:mb-6">
            Work Smarter, Share Easily
          </h2>
          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Upload quickly, find what you need fast, and share safely with control.
          </p>
        </div>

        {/* Content Grid */}
        <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center">
          {/* Left: Image - Hidden on mobile/tablet, visible from lg screens */}
          <div className="hidden lg:flex justify-center lg:justify-start">
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
                  className="object-contain animate-in fade-in duration-500 theme-light-only"
                />
                <Image
                  key={`${active.id}-dark`}
                  src={featureImages[active.id].dark}
                  alt={active.imageAlt}
                  fill
                  sizes="(min-width: 1280px) 512px, (min-width: 1024px) 448px, 384px"
                  className="object-contain animate-in fade-in duration-500 theme-dark-only"
                />
              </div>
            </div>
          </div>

          {/* Features - Full width on mobile/tablet, right column on desktop */}
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
        </div>
      </div>
    </section>
  );
}
