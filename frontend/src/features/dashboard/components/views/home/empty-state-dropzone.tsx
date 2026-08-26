'use client';

import { cn } from '@/shared/utils/utils';
import { FolderStructureProcessor } from '@/features/upload/utils/folder-structure-processor';
import { ProcessedDragData } from '@/features/upload/types/folder-upload-types';
import { useEnhancedDragDrop } from '@/features/upload/providers/enhanced-drag-drop-provider';
import { isExternalFileDrag } from '@/features/upload/utils/drag-events';

interface EmptyStateDropzoneProps {
  onFilesDropped?: (processedData: ProcessedDragData) => void;
  className?: string;
}

export function EmptyStateDropzone({ onFilesDropped, className = '' }: EmptyStateDropzoneProps) {
  // One window listener owns the drag, rather than a per-element tally of
  // dragenter against dragleave that drifts out of step. See the provider.
  const { isFileDragActive } = useEnhancedDragDrop();

  const handleDragOver = (e: React.DragEvent) => {
    if (!isExternalFileDrag(e.dataTransfer)) return;
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (!isExternalFileDrag(e.dataTransfer)) return;

    e.preventDefault();

    if (!onFilesDropped) return;

    try {
      const processedData = await FolderStructureProcessor.processDataTransferItems(
        e.dataTransfer.items
      );

      onFilesDropped(processedData);
    } catch (error) {
      console.error('Error processing drag and drop:', error);
    }
  };

  return (
    <div
      className={cn(`w-full h-full relative transition-all duration-300 ease-in-out ${className}`)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag Active Overlay */}
      {isFileDragActive ? (
        <div
          className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center rounded-lg transition-all duration-200"
          style={{
            background: 'var(--primary)',
            opacity: '0.1',
            border: '2px dashed var(--primary)',
          }}
        ></div>
      ) : null}

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
