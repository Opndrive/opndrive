'use client';

import { useState, useRef } from 'react';
import { cn } from '@/shared/utils/utils';
import { FolderStructureProcessor } from '@/features/upload/utils/folder-structure-processor';
import { ProcessedDragData } from '@/features/upload/types/folder-upload-types';

interface EmptyStateDropzoneProps {
  onFilesDropped?: (processedData: ProcessedDragData) => void;
  className?: string;
}

export function EmptyStateDropzone({ onFilesDropped, className = '' }: EmptyStateDropzoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragActive(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragActive(false);
    dragCounter.current = 0;

    if (onFilesDropped && e.dataTransfer) {
      try {
        const dataTransfer = e.dataTransfer;
        const processedData = await FolderStructureProcessor.processDataTransferItems(
          dataTransfer.items
        );

        onFilesDropped(processedData);
      } catch (error) {
        console.error('Error processing drag and drop:', error);
      }
    }

    setTimeout(() => {
      setIsDragActive(false);
      dragCounter.current = 0;
    }, 100);
  };

  return (
    <div
      className={cn(`w-full h-full relative transition-all duration-300 ease-in-out ${className}`)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag Active Overlay */}
      {isDragActive && (
        <div
          className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center rounded-lg transition-all duration-200"
          style={{
            background: 'var(--primary)',
            opacity: '0.1',
            border: '2px dashed var(--primary)',
          }}
        ></div>
      )}

      {/* Empty State Content */}
      <div className="text-center mx-auto py-16">
        {/* Home Image */}
        <div className="mb-2 flex justify-center">
          <div
            className="relative w-80 rounded-lg overflow-hidden"
            style={
              {
                //   background: 'var(--muted)',
                //   border: '1px solid var(--border)'
              }
            }
          >
            <img
              src="/home.png"
              alt="Welcome to Opndrive"
              className="w-full h-full object-contain p-4"
              style={{ filter: 'brightness(0.9)' }}
            />
          </div>
        </div>

        <p className="text-base mb-6 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
          Drag your files and folders here or use the "New" button to upload
        </p>
      </div>
    </div>
  );
}
