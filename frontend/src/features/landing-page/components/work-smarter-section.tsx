'use client';

import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { assets } from '@/assets';
import useEffectiveTheme from '@/hooks/use-effective-theme';

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

export default function WorkSmarterSection() {
  const [activeFeature, setActiveFeature] = useState(0);
  const effectiveTheme = useEffectiveTheme();

  const rotateIntervalMs = 6000;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef = useRef(false);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const startRotation = () => {
    if (prefersReducedMotion) return;
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      if (!pausedRef.current) setActiveFeature((prev) => (prev + 1) % features.length);
    }, rotateIntervalMs);
  };

  const stopRotation = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    startRotation();
    return () => stopRotation();
  }, []);

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
  const src = featureImages[active.id][effectiveTheme === 'dark' ? 'dark' : 'light'];

  return (
    <section id="tools" className="bg-background py-24 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-foreground mb-6">Work Smarter, Share Easily</h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Upload quickly, find what you need fast, and share safely with control.
          </p>
        </div>

        {/* Content Grid */}
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Image */}
          <div className="flex justify-center lg:justify-start">
            <div className="w-full max-w-lg h-96 overflow-hidden">
              <div className="relative w-full h-full">
                <Image
                  key={`${active.id}-${effectiveTheme}`}
                  src={src}
                  alt={active.imageAlt}
                  fill
                  sizes="(min-width: 1024px) 512px, 100vw"
                  className="object-contain transition-opacity duration-500"
                  priority
                />
              </div>
            </div>
          </div>

          {/* Right: Features */}
          <div
            className="space-y-6"
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
                    isActive ? 'border-l-4 border-primary pl-6' : 'border-l-4 pl-6 border-muted'
                  }`}
                >
                  <h3
                    className={`text-2xl font-semibold mb-3 transition-colors duration-300 ease-out ${
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {feature.title}
                  </h3>

                  {isActive && (
                    <p className="text-lg text-muted-foreground leading-relaxed animate-in fade-in duration-500">
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
