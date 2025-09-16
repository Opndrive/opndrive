'use client';

import React from 'react';
import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { PreviewableFile } from '@/types/file-preview';
import { useDownload } from '@/features/dashboard/hooks/use-download';
import { FileIcon } from '@/shared/components/icons/file-icons';
import { FileExtension } from '@/features/dashboard/types/file';
import { getFileExtensionWithoutDot } from '@/config/file-extensions';

interface PreviewHeaderProps {
  file: PreviewableFile;
  currentIndex: number;
  totalFiles: number;
  showNavigation: boolean;
  onClose: () => void;
  onNavigateNext?: () => void;
  onNavigatePrevious?: () => void;
  canNavigateNext: boolean;
  canNavigatePrevious: boolean;
}

export function PreviewHeader({
  file,
  currentIndex,
  totalFiles,
  showNavigation,
  onClose,
  onNavigateNext,
  onNavigatePrevious,
  canNavigateNext,
  canNavigatePrevious,
}: PreviewHeaderProps) {
  const { downloadFile, isDownloading } = useDownload();

  const handleDownload = () => {
    // Convert PreviewableFile to FileItem format
    const fileItem = {
      id: file.id,
      name: file.name,
      Key: file.key,
      extension: getFileExtensionWithoutDot(file.name),
      size: {
        value: file.size,
        unit: 'B' as const,
      },
      lastModified: file.lastModified,
    };
    downloadFile(fileItem);
  };

  // Get file extension for the icon
  const extension = getFileExtensionWithoutDot(file.name);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '64px',
        width: '100%',
        padding: '0 16px',
        margin: 0,
        boxSizing: 'border-box',
        backgroundColor: 'var(--card)',
        color: 'var(--foreground)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Left side - File icon and name */}
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
        {/* File Icon */}
        <div style={{ marginRight: '12px', flexShrink: 0 }}>
          <FileIcon extension={extension as FileExtension} className="h-6 w-6" />
        </div>

        {/* File name and counter */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            style={{
              fontSize: '18px',
              fontWeight: 500,
              color: 'var(--foreground)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
            title={file.name}
          >
            {file.name}
          </h1>
          {showNavigation && (
            <p
              style={{
                fontSize: '14px',
                color: 'var(--muted-foreground)',
                margin: '2px 0 0 0',
              }}
            >
              {currentIndex + 1} of {totalFiles}
            </p>
          )}
        </div>
      </div>

      {/* Center - Navigation (if multiple files) */}
      {showNavigation && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            margin: '0 16px',
          }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={onNavigatePrevious}
            disabled={!canNavigatePrevious}
            className="hover:bg-accent h-9 w-9 rounded-full"
            style={{
              color: canNavigatePrevious ? 'var(--foreground)' : 'var(--muted-foreground)',
              opacity: canNavigatePrevious ? 1 : 0.5,
            }}
            title="Previous file (←)"
          >
            <ChevronLeft size={18} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onNavigateNext}
            disabled={!canNavigateNext}
            className="hover:bg-accent h-9 w-9 rounded-full"
            style={{
              color: canNavigateNext ? 'var(--foreground)' : 'var(--muted-foreground)',
              opacity: canNavigateNext ? 1 : 0.5,
            }}
            title="Next file (→)"
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      )}

      {/* Right side - Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {/* Download button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDownload}
          disabled={isDownloading(file.id)}
          className="hover:bg-accent h-10 w-10 rounded-full"
          style={{ color: 'var(--foreground)' }}
          title="Download file"
        >
          <Download size={20} />
        </Button>

        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="hover:bg-accent h-10 w-10 rounded-full"
          style={{ color: 'var(--foreground)' }}
          title="Close preview (Esc)"
        >
          <X size={20} />
        </Button>
      </div>
    </div>
  );
}
