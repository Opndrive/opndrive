'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hasValidLoginSession } from '@/lib/auth-session';

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (hasValidLoginSession()) {
      router.replace('/connect');
      return;
    }

    router.replace('/login');
  }, [router]);

  return null;
}
