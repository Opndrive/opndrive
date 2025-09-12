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

  useEffect(() => {
    async function loadCode() {
      try {
        setLoading(true);
        setError(null);

        const s3PreviewService = createS3PreviewService(apiS3);
        const signedUrl = await s3PreviewService.getSignedUrl(file);

        const response = await fetch(signedUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch code file: ${response.statusText}`);
        }

        const codeText = await response.text();
        setCodeContent(codeText);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load code:', err);
        setError(err instanceof Error ? err.message : 'Failed to load code');
        setLoading(false);
      }
    }

    loadCode();
  }, [file.key]);

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

  if (!codeContent) {
    return (
      <PreviewError
        title="Code Preview Error"
        message="No code content available"
        onRetry={handleRetry}
      />
    );
  }

  const language = getSyntaxLanguage(file.name);
  const lines = codeContent.split('\n');
  const maxLines = Math.min(lines.length, 1000);

  return (
    <div className="w-full h-full overflow-auto bg-white dark:bg-gray-950 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden font-mono">
        {/* Header */}
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{file.name}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {lines.length} lines • {language} • {(file.size / 1024).toFixed(1)} KB
              {maxLines < lines.length && ` (showing first ${maxLines} lines)`}
            </p>
          </div>
          <div className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-xs font-medium text-gray-700 dark:text-gray-300">
            {language}
          </div>
        </div>

        {/* Code Content */}
        <div className="overflow-auto max-h-[calc(100vh-200px)]">
          <div className="flex">
            {/* Line Numbers */}
            <div className="bg-gray-100 dark:bg-gray-800 px-3 py-4 text-sm text-gray-500 dark:text-gray-400 select-none border-r border-gray-200 dark:border-gray-700 min-w-[60px] text-right sticky left-0">
              {lines.slice(0, maxLines).map((_, index) => (
                <div key={index} className="leading-6">
                  {index + 1}
                </div>
              ))}
            </div>

            {/* Code */}
            <div className="px-4 py-4 text-sm leading-6 flex-1 whitespace-pre-wrap break-words overflow-x-auto bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
              {lines.slice(0, maxLines).map((line, index) => (
                <div key={index} className="min-h-[24px]">
                  {line || ' '}
                </div>
              ))}
              {maxLines < lines.length && (
                <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded text-center text-gray-600 dark:text-gray-400">
                  ... {lines.length - maxLines} more lines (truncated for performance)
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
