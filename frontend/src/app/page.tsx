'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import HeroSection from '@/features/landing-page/components/hero-section';
import Navbar from '@/features/landing-page/components/navbar';
import FeaturesSection from '@/features/landing-page/components/feature-section';
import WorkSmarterSection from '@/features/landing-page/components/work-smarter-section';
import FAQSection from '@/features/landing-page/components/faq-section';
import CTASection from '@/features/landing-page/components/cta-section';

export default function LandingPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleGetStarted = async () => {
    setIsLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 300));

      const stored = localStorage.getItem('s3_user_session');
      if (stored) {
        router.push('/dashboard');
      } else {
        router.push('/connect');
      }
    } catch (error) {
      console.error('Error during navigation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main>
      <HeroSection handleGetStarted={handleGetStarted} isLoading={isLoading} />
      <Navbar />
      <FeaturesSection />
      <WorkSmarterSection />
      <FAQSection />
      <CTASection handleGetStarted={handleGetStarted} isLoading={isLoading} />
    </main>
  );
}
