'use client';

import React from 'react';
import { PreviewableFile } from '@/types/file-preview';

interface PreviewContentProps {
  file: PreviewableFile;
}

export function PreviewContent({ file }: PreviewContentProps) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center max-w-lg text-gray-900 dark:text-gray-100">
        <div className="text-6xl mb-6">📄</div>
        <h3 className="text-2xl font-medium mb-4">Preview Content</h3>
        <p className="text-lg opacity-70 mb-6">File: {file.name}</p>
        <p className="text-sm opacity-50">Preview system is loading...</p>
      </div>
    </div>
  );
}
