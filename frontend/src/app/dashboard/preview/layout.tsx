'use client';

import { ReactNode } from 'react';

/**
 * Minimal layout for preview pages
 * This layout bypasses the dashboard sidebar and navbar for a cleaner preview experience
 */
export default function PreviewLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
