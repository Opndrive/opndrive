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

  const extension = getFileExtensionWithoutDot(file.name);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '64px',
        width: '100%',
        padding: '0 8px',
        margin: 0,
        boxSizing: 'border-box',
        backgroundColor: 'var(--card)',
        color: 'var(--foreground)',
        borderBottom: '1px solid var(--border)',
      }}
      className="sm:px-4 md:px-6"
    >
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
        <div style={{ marginRight: '8px', flexShrink: 0 }} className="sm:mr-3">
          <FileIcon extension={extension as FileExtension} className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--foreground)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
            className="sm:text-base md:text-lg"
            title={file.name}
          >
            {file.name}
          </h1>
          {showNavigation && (
            <p
              style={{
                fontSize: '12px',
                color: 'var(--muted-foreground)',
                margin: '2px 0 0 0',
              }}
              className="sm:text-sm"
            >
              {currentIndex + 1} of {totalFiles}
            </p>
          )}
        </div>
      </div>

      {showNavigation && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            margin: '0 8px',
          }}
          className="hidden sm:flex sm:gap-1 sm:mx-4"
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={onNavigatePrevious}
            disabled={!canNavigatePrevious}
            className="hover:bg-accent h-8 w-8 sm:h-9 sm:w-9 rounded-full"
            style={{
              color: canNavigatePrevious ? 'var(--foreground)' : 'var(--muted-foreground)',
              opacity: canNavigatePrevious ? 1 : 0.5,
            }}
            title="Previous file (←)"
          >
            <ChevronLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onNavigateNext}
            disabled={!canNavigateNext}
            className="hover:bg-accent h-8 w-8 sm:h-9 sm:w-9 rounded-full"
            style={{
              color: canNavigateNext ? 'var(--foreground)' : 'var(--muted-foreground)',
              opacity: canNavigateNext ? 1 : 0.5,
            }}
            title="Next file (→)"
          >
            <ChevronRight size={16} className="sm:w-[18px] sm:h-[18px]" />
          </Button>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
        className="sm:gap-2"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDownload}
          disabled={isDownloading(file.id)}
          className="hover:bg-accent h-8 w-8 sm:h-10 sm:w-10 rounded-full"
          style={{ color: 'var(--foreground)' }}
          title="Download file"
        >
          <Download size={16} className="sm:w-5 sm:h-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="hover:bg-accent h-8 w-8 sm:h-10 sm:w-10 rounded-full"
          style={{ color: 'var(--foreground)' }}
          title="Close preview (Esc)"
        >
          <X size={16} className="sm:w-5 sm:h-5" />
        </Button>
      </div>
    </div>
  );
}
