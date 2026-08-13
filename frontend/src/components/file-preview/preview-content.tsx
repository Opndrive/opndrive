'use client';

import React from 'react';
import { PreviewableFile } from '@/types/file-preview';
import { ImageViewer } from './viewers/image-viewer';
import { VideoViewer } from './viewers/video-viewer';
import { AudioViewer } from './viewers/audio-viewer';
import { PDFViewer } from './viewers/pdf-viewer';
import { ExcelViewer } from './viewers/excel-viewer';
import { CodeViewer } from './viewers/code-viewer';
import { checkPreviewEligibility } from '@/services/file-size-limits';
import { Download } from 'lucide-react';
import { useDownloadActions, useIsFileDownloading } from '@/features/dashboard/hooks/use-download';
import {
  isFileInCategory,
  getFileExtension,
  getFileExtensionWithoutDot,
} from '@/config/file-extensions';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { PreviewError } from './preview-error';

interface PreviewContentProps {
  file: PreviewableFile;
}

// Utility functions using centralized config
function isFileType(
  filename: string,
  category: 'image' | 'video' | 'audio' | 'document' | 'spreadsheet' | 'code'
): boolean {
  return isFileInCategory(filename, category);
}

// Returns null when nothing here can render the file
function selectViewer(file: PreviewableFile) {
  if (isFileType(file.name, 'image')) {
    return <ImageViewer file={file} />;
  }

  if (isFileType(file.name, 'video')) {
    return <VideoViewer file={file} />;
  }

  if (isFileType(file.name, 'audio')) {
    return <AudioViewer file={file} />;
  }

  if (getFileExtension(file.name) === '.pdf') {
    return <PDFViewer file={file} />;
  }

  if (isFileType(file.name, 'spreadsheet')) {
    return <ExcelViewer file={file} />;
  }

  if (isFileType(file.name, 'code')) {
    return <CodeViewer file={file} />;
  }

  return null;
}

export function PreviewContent({ file }: PreviewContentProps) {
  const { downloadFile } = useDownloadActions();
  const isDownloading = useIsFileDownloading(file.id);

  // Get file size from either 'size' or 'Size' property
  const fileSize =
    typeof file.size === 'number'
      ? file.size
      : typeof (file as unknown as Record<string, unknown>).Size === 'number'
        ? ((file as unknown as Record<string, unknown>).Size as number)
        : 0;

  // Convert PreviewableFile to FileItem format for download
  const handleDownload = () => {
    const fileItem = {
      id: file.id,
      name: file.name,
      Key: file.key,
      extension: file.type || getFileExtensionWithoutDot(file.name),
      size: {
        value: fileSize,
        unit: 'B' as const,
      },
      lastModified: file.lastModified,
    };
    downloadFile(fileItem);
  };

  // Check if file size is within preview limits
  const eligibilityCheck = checkPreviewEligibility(file.name, fileSize);

  if (!eligibilityCheck.canPreview) {
    const reason = eligibilityCheck.reason || 'File cannot be previewed';

    // Determine specific error title based on the reason
    let errorTitle = 'Preview Not Available';
    if (reason.includes('File type not supported')) {
      errorTitle = 'File Type Not Supported';
    } else if (reason.includes('exceeds') || reason.includes('limit')) {
      errorTitle = 'File Size Too Large';
    } else if (reason.includes('not previewable')) {
      errorTitle = 'Preview Not Available';
    }

    return (
      <div
        className="w-full h-full flex items-center justify-center p-8"
        style={{
          backgroundColor: 'var(--preview-modal-content-bg)',
          color: 'var(--foreground)',
        }}
      >
        <div className="text-center max-w-lg">
          <h3 className="text-2xl font-medium mb-4" style={{ color: 'var(--foreground)' }}>
            {errorTitle}
          </h3>
          <p
            className="text-lg mb-6"
            style={{
              color: 'var(--muted-foreground)',
              opacity: 0.7,
            }}
          >
            {reason}
          </p>
          <p
            className="text-sm mb-8"
            style={{
              color: 'var(--muted-foreground)',
              opacity: 0.6,
            }}
          >
            Please download the file to view its contents.
          </p>
          <button
            className="inline-flex items-center cursor-pointer gap-2 px-6 py-3 rounded-lg font-medium transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
            onClick={handleDownload}
            disabled={isDownloading}
          >
            <Download size={18} />
            {isDownloading ? 'Downloading...' : 'Download File'}
          </button>
        </div>
      </div>
    );
  }

  // Route to appropriate viewer component
  const viewer = selectViewer(file);

  // The viewers parse file content we did not write - pdf, xlsx and the code
  // editor most of all - and this modal is rendered by the dashboard layout,
  // which no route level error.tsx covers. Without this boundary one malformed
  // file takes the whole dashboard down instead of just the panel.
  if (viewer) {
    return (
      <ErrorBoundary
        resetKey={file.id}
        fallback={(_error, reset) => (
          <PreviewError
            title="Preview Failed"
            message={`${file.name} could not be displayed. The file may be corrupted or in an unexpected format.`}
            onRetry={reset}
          />
        )}
      >
        {viewer}
      </ErrorBoundary>
    );
  }

  // Unsupported file type
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{
        backgroundColor: 'var(--preview-modal-content-bg)',
        color: 'var(--foreground)',
      }}
    >
      <div className="text-center max-w-lg">
        <h3 className="text-2xl font-medium mb-4" style={{ color: 'var(--foreground)' }}>
          File Type Not Supported
        </h3>
        <p
          className="text-lg mb-6"
          style={{
            color: 'var(--muted-foreground)',
            opacity: 0.7,
          }}
        >
          {file.name} cannot be previewed in the browser.
        </p>
        <p
          className="text-sm"
          style={{
            color: 'var(--muted-foreground)',
            opacity: 0.5,
          }}
        >
          Supported formats: Images, Videos, Audio, PDFs, Excel/CSV files, and Code files
        </p>
      </div>
    </div>
  );
}
