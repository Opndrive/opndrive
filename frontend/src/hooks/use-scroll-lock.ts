'use client';

import { useLayoutEffect } from 'react';

export const useScrollLock = (active: boolean) => {
  useLayoutEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
};
