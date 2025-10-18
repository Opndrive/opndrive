'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CTASection from '@/features/landing-page/components/cta-section';

export function BlogCTASection() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleGetStarted = async () => {
    setIsLoading(true);
    router.push('/connect');
  };

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8">
      <CTASection handleGetStarted={handleGetStarted} isLoading={isLoading} />
    </div>
  );
}
