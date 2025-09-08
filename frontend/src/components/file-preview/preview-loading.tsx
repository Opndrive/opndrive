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
      style={{ backgroundColor: 'var(--preview-modal-loading-bg)' }}
    >
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--muted-foreground)' }} />
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          {message}
        </p>
      </div>
    </div>
  );
}
