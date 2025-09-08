'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

interface PreviewErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function PreviewError({
  title = 'Preview Error',
  message = 'Unable to preview this file. The file may be corrupted or in an unsupported format.',
  onRetry,
}: PreviewErrorProps) {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="max-w-md w-full text-center">
        <div
          className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-full"
          style={{ backgroundColor: 'var(--preview-modal-error-bg)' }}
        >
          <AlertCircle className="h-6 w-6" style={{ color: 'var(--preview-modal-error-color)' }} />
        </div>
        <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--foreground)' }}>
          {title}
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
          {message}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-sm hover:underline"
            style={{ color: 'var(--primary)' }}
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
