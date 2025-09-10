'use client';

import React from 'react';
import { PreviewableFile } from '@/types/file-preview';
import { ImageViewer } from './viewers/image-viewer';
import { VideoViewer } from './viewers/video-viewer';
import { PDFViewer } from './viewers/pdf-viewer';
import { ExcelViewer } from './viewers/excel-viewer';
import { CodeViewer } from './viewers/code-viewer';
import { checkPreviewEligibility, getFileExtension } from '@/services/file-size-limits';
import { Download } from 'lucide-react';
import { useDownload } from '@/features/dashboard/hooks/use-download';

interface PreviewContentProps {
  file: PreviewableFile;
}

// File type configurations
const SUPPORTED_EXTENSIONS = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'],
  video: ['.mp4', '.webm', '.ogv', '.mov', '.avi', '.mkv', '.wmv', '.m4v'],
  pdf: ['.pdf'],
  spreadsheet: ['.csv', '.xls', '.xlsx', '.xlsm', '.xlsb', '.ods'],
  code: [
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.py',
    '.java',
    '.cpp',
    '.c',
    '.cs',
    '.php',
    '.rb',
    '.go',
    '.rust',
    '.html',
    '.css',
    '.scss',
    '.sass',
    '.json',
    '.xml',
    '.yaml',
    '.yml',
    '.md',
    '.txt',
  ],
};

// Utility functions
function isFileType(filename: string, type: keyof typeof SUPPORTED_EXTENSIONS): boolean {
  return SUPPORTED_EXTENSIONS[type].includes(getFileExtension(filename));
}

export function PreviewContent({ file }: PreviewContentProps) {
  const { downloadFile, isDownloading } = useDownload();

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
      extension: file.type || file.name.split('.').pop() || '',
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

  if (!eligibilityCheck.canPreview && eligibilityCheck.error) {
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
            {eligibilityCheck.error.title}
          </h3>
          <p
            className="text-lg mb-6"
            style={{
              color: 'var(--muted-foreground)',
              opacity: 0.7,
            }}
          >
            {eligibilityCheck.error.message}
          </p>
          <p
            className="text-sm mb-8"
            style={{
              color: 'var(--muted-foreground)',
              opacity: 0.6,
            }}
          >
            {eligibilityCheck.error.suggestion}
          </p>
          <button
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors hover:opacity-80"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
            onClick={handleDownload}
            disabled={isDownloading(file.id)}
          >
            <Download size={18} />
            {isDownloading(file.id) ? 'Downloading...' : 'Download File'}
          </button>
        </div>
      </div>
    );
  }

  const isImage = isFileType(file.name, 'image');
  const isVideo = isFileType(file.name, 'video');
  const isPdf = isFileType(file.name, 'pdf');
  const isSpreadsheet = isFileType(file.name, 'spreadsheet');
  const isCode = isFileType(file.name, 'code');

  // Route to appropriate viewer component
  if (isImage) {
    return <ImageViewer file={file} />;
  }

  if (isVideo) {
    return <VideoViewer file={file} />;
  }

  if (isPdf) {
    return <PDFViewer file={file} />;
  }

  if (isSpreadsheet) {
    return <ExcelViewer file={file} />;
  }

  if (isCode) {
    return <CodeViewer file={file} />;
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
          Preview not available
        </h3>
        <p
          className="text-lg mb-6"
          style={{
            color: 'var(--muted-foreground)',
            opacity: 0.7,
          }}
        >
          {file.name} cannot be previewed.
        </p>
        <p
          className="text-sm"
          style={{
            color: 'var(--muted-foreground)',
            opacity: 0.5,
          }}
        >
          Supported formats: Images, Videos, PDFs, Excel/CSV files, and Code files
        </p>
      </div>
    </div>
  );
}
