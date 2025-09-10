'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

interface PreviewLoadingProps {
  message?: string;
}

export function PreviewLoading({ message = 'Loading preview...' }: PreviewLoadingProps) {
  return (
    <div
      className="flex items-center justify-center h-full"
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'hsl(var(--primary))' }} />
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {message}
        </p>
      </div>
    </div>
  );
}
