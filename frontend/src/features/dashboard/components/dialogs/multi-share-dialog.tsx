'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Share, Clock, Copy, Check, ExternalLink, AlertCircle } from 'lucide-react';
import type { FileItem } from '../../types/file';
import { useSettings } from '@/features/settings/hooks/use-settings';
import { getDurationInSeconds, formatDurationLabel } from '@/features/settings/constants';

interface MultiShareDialogProps {
  isOpen: boolean;
  files: FileItem[];
  onClose: () => void;
  generateShareLinks: (
    files: FileItem[],
    durationInSeconds: number
  ) => Promise<Array<{ file: FileItem; url?: string; error?: string }>>;
}

interface ShareResult {
  file: FileItem;
  url?: string;
  error?: string;
}

export const MultiShareDialog: React.FC<MultiShareDialogProps> = ({
  isOpen,
  files,
  onClose,
  generateShareLinks,
}) => {
  const [shareResults, setShareResults] = useState<ShareResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const { settings } = useSettings();

  // Auto-generate links when dialog opens
  useEffect(() => {
    if (isOpen && files.length > 0) {
      handleGenerateLinks();
    }
  }, [isOpen, files]);

  const handleGenerateLinks = async () => {
    setIsGenerating(true);
    setShareResults([]);

    try {
      const durationInSeconds = getDurationInSeconds(settings.general.bulkShareDuration);
      const results = await generateShareLinks(files, durationInSeconds);
      setShareResults(results);
    } catch (error) {
      console.error('Failed to generate share links:', error);
      setShareResults(
        files.map((file) => ({
          file,
          error: 'Failed to generate share link',
        }))
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (url: string, index: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleCopyAll = async () => {
    const successfulLinks = shareResults
      .filter((result) => result.url && !result.error)
      .map((result) => `${result.file.name}: ${result.url}`)
      .join('\n');

    if (successfulLinks) {
      try {
        await navigator.clipboard.writeText(successfulLinks);
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
      } catch (error) {
        console.error('Failed to copy all:', error);
      }
    }
  };

  const handleOpenLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleClose = () => {
    setShareResults([]);
    setIsGenerating(false);
    setCopiedIndex(null);
    setCopiedAll(false);
    onClose();
  };

  if (!isOpen) return null;

  const successCount = shareResults.filter((result) => result.url && !result.error).length;
  const errorCount = shareResults.filter((result) => result.error).length;

  // Get current duration label using the formatter
  const currentDurationLabel = formatDurationLabel(settings.general.bulkShareDuration);

  const dialogContent = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ isolation: 'isolate' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
        onClick={handleClose}
      />

      {/* Dialog */}
      <div
        className="relative rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <Share className="h-5 w-5" style={{ color: 'var(--primary)' }} />
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
                Share {files.length} {files.length === 1 ? 'file' : 'files'}
              </h2>
              {shareResults.length > 0 && (
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                  {successCount} successful
                  {errorCount > 0 && `, ${errorCount} failed`}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-full cursor-pointer hover:bg-accent transition-colors"
            style={{ color: 'var(--muted-foreground)' }}
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isGenerating ? (
            /* Generating State */
            <div className="flex flex-col items-center justify-center py-12">
              <div
                className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mb-4"
                style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }}
              />
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                Generating share links...
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                Processing {files.length} {files.length === 1 ? 'file' : 'files'}
              </p>
            </div>
          ) : shareResults.length > 0 ? (
            /* Share Results */
            <div className="px-6 py-4">
              <div className="space-y-3">
                {shareResults.map((result, index) => (
                  <div
                    key={result.file.id}
                    className="p-4 rounded-lg border"
                    style={{
                      backgroundColor: result.error ? 'var(--destructive)/5' : 'var(--muted)',
                      borderColor: result.error ? 'var(--destructive)' : 'var(--border)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {result.error ? (
                        <AlertCircle
                          className="h-5 w-5 flex-shrink-0 mt-0.5"
                          style={{ color: 'var(--destructive)' }}
                        />
                      ) : (
                        <Check
                          className="h-5 w-5 flex-shrink-0 mt-0.5"
                          style={{ color: 'var(--primary)' }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-medium text-sm truncate mb-1"
                          style={{ color: 'var(--foreground)' }}
                        >
                          {result.file.name}
                        </p>
                        {result.error ? (
                          <p className="text-xs" style={{ color: 'var(--destructive)' }}>
                            {result.error}
                          </p>
                        ) : result.url ? (
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              type="text"
                              value={result.url}
                              readOnly
                              className="flex-1 px-2 py-1.5 text-xs rounded border"
                              style={{
                                backgroundColor: 'var(--background)',
                                borderColor: 'var(--border)',
                                color: 'var(--muted-foreground)',
                              }}
                            />
                            <button
                              onClick={() => result.url && handleCopy(result.url, index)}
                              className="px-2 py-1.5 cursor-pointer rounded border transition-colors"
                              style={{
                                backgroundColor:
                                  copiedIndex === index ? 'var(--primary)' : 'var(--secondary)',
                                borderColor: 'var(--border)',
                                color:
                                  copiedIndex === index
                                    ? 'var(--primary-foreground)'
                                    : 'var(--foreground)',
                              }}
                            >
                              {copiedIndex === index ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => result.url && handleOpenLink(result.url)}
                              className="px-2 py-1.5 cursor-pointer rounded border transition-colors hover:bg-accent"
                              style={{
                                backgroundColor: 'var(--secondary)',
                                borderColor: 'var(--border)',
                                color: 'var(--foreground)',
                              }}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t flex items-center justify-between flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          {shareResults.length > 0 && successCount > 0 ? (
            <>
              <div
                className="flex items-center gap-2 text-sm"
                style={{ color: 'var(--muted-foreground)' }}
              >
                <Clock className="h-4 w-4" />
                <span>Links expire in {currentDurationLabel.toLowerCase()}</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm cursor-pointer font-medium rounded-md transition-colors hover:bg-accent"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  Close
                </button>
                <button
                  onClick={handleCopyAll}
                  className="px-6 py-2 cursor-pointer text-sm font-medium rounded-md transition-colors"
                  style={{
                    backgroundColor: copiedAll ? 'var(--primary)' : 'var(--primary)',
                    color: 'var(--primary-foreground)',
                    opacity: copiedAll ? 0.8 : 1,
                  }}
                >
                  {copiedAll ? 'Copied!' : 'Copy All Links'}
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex justify-end">
              <button
                onClick={handleClose}
                className="px-6 py-2 cursor-pointer text-sm font-medium rounded-md transition-colors"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(dialogContent, document.body) : null;
};
