'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

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
    <div
      className="flex items-center justify-center h-full p-8"
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      <div
        className="max-w-md w-full text-center p-8 rounded-lg border shadow-lg"
        style={{
          backgroundColor: 'hsl(var(--card))',
          borderColor: 'hsl(var(--border))',
        }}
      >
        <div
          className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full"
          style={{ backgroundColor: 'hsl(var(--destructive) / 0.1)' }}
        >
          <AlertCircle className="h-8 w-8" style={{ color: 'hsl(var(--destructive))' }} />
        </div>

        <h3 className="text-xl font-semibold mb-3" style={{ color: 'hsl(var(--foreground))' }}>
          {title}
        </h3>

        <p
          className="text-sm leading-relaxed mb-6"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          {message}
        </p>

        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors hover:opacity-90"
            style={{
              backgroundColor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
        )}

        <div
          className="mt-6 pt-4 border-t text-xs"
          style={{
            borderColor: 'hsl(var(--border))',
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          If this error persists, please check the file or contact support.
        </div>
      </div>
    </div>
  );
}
