'use client';

import { useEffect, useState } from 'react';
import { useTheme } from '@/providers/theme-provider';

/**
 * useEffectiveTheme
 * Resolves the current theme ('light'|'dark') by combining the theme provider
 * value and the system preference when the provider theme is 'system'.
 * Subscribes to prefers-color-scheme changes so consumers update reactively.
 */
export default function useEffectiveTheme(): 'light' | 'dark' {
  const { theme } = useTheme();

  const [effective, setEffective] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (!theme || theme === 'system') return prefersDark ? 'dark' : 'light';
    return theme === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const resolve = () => {
      if (!theme || theme === 'system') setEffective(mq.matches ? 'dark' : 'light');
      else setEffective(theme === 'dark' ? 'dark' : 'light');
    };

    resolve();
    mq.addEventListener('change', resolve);
    return () => mq.removeEventListener('change', resolve);
  }, [theme]);

  return effective;
}
