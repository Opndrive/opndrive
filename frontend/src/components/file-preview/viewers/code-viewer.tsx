'use client';

import React, { useState, useEffect } from 'react';
import { PreviewableFile } from '@/types/file-preview';
import { createS3PreviewService } from '@/services/s3-preview-service';
import { PreviewError } from '../preview-error';
import { PreviewLoading } from '../preview-loading';
import { getSyntaxLanguage } from '@/config/file-extensions';
import { useApiS3 } from '@/hooks/use-auth';

interface CodeViewerProps {
  file: PreviewableFile;
}

export function CodeViewer({ file }: CodeViewerProps) {
  const [codeContent, setCodeContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiS3 = useApiS3();

  if (!apiS3) {
    return 'Loading...';
  }

  const s3PreviewService = createS3PreviewService(apiS3);

  useEffect(() => {
    async function loadCode() {
      try {
        setLoading(true);
        setError(null);

        const signedUrl = await s3PreviewService.getSignedUrl(file);

        const response = await fetch(signedUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch code file: ${response.statusText}`);
        }

        const codeText = await response.text();
        // For .txt files and other text files, even empty content is valid
        setCodeContent(codeText);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load code:', err);
        setError(err instanceof Error ? err.message : 'Failed to load code');
        setLoading(false);
      }
    }

    loadCode();
  }, [file.key, file.Key, file.name]);

  const handleRetry = () => {
    setError(null);
    setCodeContent(null);
    setLoading(true);
  };

  if (loading) {
    return <PreviewLoading message={`Loading ${file.name}...`} />;
  }

  if (error) {
    return <PreviewError title="Code Preview Error" message={error} onRetry={handleRetry} />;
  }

  // Only show error if codeContent is null (failed to load), not if it's empty string
  if (codeContent === null) {
    return (
      <PreviewError
        title="Code Preview Error"
        message="No code content available"
        onRetry={handleRetry}
      />
    );
  }

  const language = getSyntaxLanguage(file.name);
  const lines = codeContent === '' ? [''] : codeContent.split('\n');
  const maxLines = Math.min(lines.length, 1000);

  return (
    <div className="w-full h-full overflow-auto p-4" style={{ background: 'var(--background)' }}>
      <div
        className="rounded-lg shadow-lg overflow-hidden font-mono"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{
            background: 'var(--secondary)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <h3 className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>
              {file.name}
            </h3>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              {codeContent === '' ? '0' : lines.length} lines • {language} •{' '}
              {(file.size / 1024).toFixed(1)} KB
              {maxLines < lines.length && ` (showing first ${maxLines} lines)`}
            </p>
          </div>
          <div
            className="px-2 py-1 rounded text-xs font-medium"
            style={{
              background: 'var(--muted)',
              color: 'var(--muted-foreground)',
            }}
          >
            {language}
          </div>
        </div>

        {/* Code Content */}
        <div className="overflow-auto max-h-[calc(100vh-200px)]">
          <div className="flex">
            {/* Line Numbers */}
            <div
              className="px-3 py-4 text-sm select-none min-w-[60px] text-right sticky left-0"
              style={{
                background: 'var(--muted)',
                color: 'var(--muted-foreground)',
                borderRight: '1px solid var(--border)',
              }}
            >
              {codeContent === '' ? (
                <div className="leading-6 opacity-50">-</div>
              ) : (
                lines.slice(0, maxLines).map((_, index) => (
                  <div key={index} className="leading-6">
                    {index + 1}
                  </div>
                ))
              )}
            </div>

            {/* Code */}
            <div
              className="px-4 py-4 text-sm leading-6 flex-1 whitespace-pre-wrap break-words overflow-x-auto"
              style={{
                background: 'var(--card)',
                color: 'var(--card-foreground)',
              }}
            >
              {codeContent === '' ? (
                <div
                  className="flex items-center justify-center h-32 text-center"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  <div>
                    <p className="mb-2">This file is empty</p>
                    <p className="text-xs opacity-75">No content to display</p>
                  </div>
                </div>
              ) : (
                <>
                  {lines.slice(0, maxLines).map((line, index) => (
                    <div key={index} className="min-h-[24px]">
                      {line || ' '}
                    </div>
                  ))}
                  {maxLines < lines.length && (
                    <div
                      className="mt-4 p-3 rounded text-center"
                      style={{
                        background: 'var(--muted)',
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      ... {lines.length - maxLines} more lines (truncated for performance)
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
