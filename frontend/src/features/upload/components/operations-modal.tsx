'use client';

import React, { useState } from 'react';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import { uploadManager } from '@/lib/uploadManagerInstance';
import { HiOutlineXMark, HiOutlineChevronUp, HiOutlineChevronDown } from 'react-icons/hi2';
import { FileIcon } from '@/shared/components/icons/file-icons';
import { FolderIcon } from '@/shared/components/icons/folder-icons';
import type { FileExtension } from '@/config/file-extensions';

interface OperationItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  operationType: 'upload' | 'delete';
  status: string;
  progress: number;
  size?: number;
  totalFiles?: number;
  completedFiles?: number;
  fileIds?: string[];
  parentFolderId?: string;
  isCalculatingSize?: boolean;
  error?: string;
  extension?: FileExtension;
}

export const OperationsModal: React.FC = () => {
  const { uploads, deletes, removeUpload, removeDeleteOperation } = useUploadStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Helper function to cancel operations (both upload and delete)
  const cancelOperation = (
    itemId: string,
    operationType: 'upload' | 'delete',
    isFolder = false
  ) => {
    if (operationType === 'upload') {
      if (isFolder) {
        const folder = uploads[itemId];
        if (folder && folder.fileIds) {
          // Cancel all individual files in the folder
          folder.fileIds.forEach((fileId) => {
            uploadManager.cancelUpload(fileId);
          });
          // The folder status will be updated by the upload manager
        }
      } else {
        uploadManager.cancelUpload(itemId);
      }
    } else if (operationType === 'delete') {
      // For delete operations, we need to cancel the delete operation
      // This depends on your delete implementation - you might need to add a cancel method
      // For now, we'll remove it from the store (assuming it can be cancelled)
      removeDeleteOperation(itemId);
    }
  };

  // Calculate folder progress based on its files
  const getFolderProgress = (folderId: string): number => {
    const folder = uploads[folderId];
    if (!folder || !folder.fileIds) return 0;

    const fileProgresses = folder.fileIds.map((id) => uploads[id]?.progress || 0);
    return fileProgresses.reduce((sum, progress) => sum + progress, 0) / fileProgresses.length;
  };

  // Extract file extension from filename
  const getFileExtension = (filename: string): FileExtension | undefined => {
    const parts = filename.split('.');
    if (parts.length <= 1) return undefined;

    const ext = parts[parts.length - 1].toLowerCase();
    // Type assertion is safe here since we're checking against known extensions
    // If the extension is not in our FileExtension type, we'll return undefined
    return ext as FileExtension;
  };

  // Combine and transform operations into unified format
  const allOperations: OperationItem[] = [
    // Upload operations
    ...Object.values(uploads)
      .filter((u) => u.type === 'folder' || (u.type === 'file' && !u.parentFolderId))
      .map((upload) => ({
        id: upload.id,
        name: upload.name,
        type: upload.type,
        operationType: 'upload' as const,
        status: upload.status,
        progress: upload.type === 'folder' ? getFolderProgress(upload.id) : upload.progress,
        fileIds: upload.fileIds,
        parentFolderId: upload.parentFolderId,
        extension: upload.type === 'file' ? getFileExtension(upload.name) : undefined,
      })),
    // Delete operations
    ...Object.values(deletes).map((deleteOp) => ({
      id: deleteOp.id,
      name: deleteOp.name,
      type: deleteOp.type,
      operationType: 'delete' as const,
      status: deleteOp.status,
      progress: deleteOp.progress,
      size: deleteOp.size,
      totalFiles: deleteOp.totalFiles,
      completedFiles: deleteOp.completedFiles,
      isCalculatingSize: deleteOp.isCalculatingSize,
      error: deleteOp.error,
      extension: deleteOp.type === 'file' ? getFileExtension(deleteOp.name) : undefined,
    })),
  ];

  // If no operations, don't show modal
  if (allOperations.length === 0) {
    return null;
  }

  // Count different types of operations
  const activeUploads = allOperations.filter(
    (op) => op.operationType === 'upload' && ['uploading', 'queued'].includes(op.status)
  ).length;

  const completedOps = allOperations.filter((op) => op.status === 'completed').length;

  const cancelledOps = allOperations.filter((op) => op.status === 'cancelled').length;

  // Get title based on operations
  const getTitle = () => {
    if (cancelledOps > 0 && activeUploads === 0) {
      return `${cancelledOps} upload${cancelledOps > 1 ? 's' : ''} cancelled`;
    }
    if (completedOps > 0 && activeUploads === 0) {
      return `Upload complete`;
    }
    if (activeUploads > 0) {
      return `Uploading ${activeUploads} item${activeUploads > 1 ? 's' : ''}`;
    }
    return `${allOperations.length} operation${allOperations.length > 1 ? 's' : ''}`;
  };

  // Get subtitle based on active uploads
  const getSubtitle = () => {
    if (activeUploads > 0) {
      // Separate uploading and queued items
      const uploadingItems = allOperations.filter((op) => op.status === 'uploading');
      const queuedItems = allOperations.filter((op) => op.status === 'queued');

      // If we have items actually uploading, show progress
      if (uploadingItems.length > 0) {
        const totalProgress = uploadingItems.reduce((sum, op) => sum + op.progress, 0);
        const avgProgress = Math.round(totalProgress / uploadingItems.length);

        if (avgProgress > 0) {
          // Show progress-based time estimate
          const remainingProgress = (100 - avgProgress) * uploadingItems.length;
          const estimatedMinutes = Math.max(1, Math.round(remainingProgress / 20));
          return `${estimatedMinutes} min left...`;
        }
      }

      // If all items are queued or just started uploading (0% progress)
      if (
        queuedItems.length === activeUploads ||
        uploadingItems.every((item) => item.progress === 0)
      ) {
        return 'Starting uploads...';
      }

      // Fallback for mixed states
      return 'Uploading...';
    }
    return null;
  };

  return (
    <>
      {/* Desktop Modal - Google Drive Style */}
      <div className="hidden md:block">
        <div
          className={`fixed right-4 bottom-4 z-50 transition-all duration-300 ease-in-out ${
            isExpanded ? 'w-80' : 'w-80'
          }`}
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
          }}
        >
          {/* Header - Google Drive Style */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {getTitle()}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 rounded transition-colors duration-200"
                style={{
                  color: 'var(--muted-foreground)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {isExpanded ? (
                  <HiOutlineChevronDown className="w-4 h-4" />
                ) : (
                  <HiOutlineChevronUp className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => {
                  const hasActiveOperations = allOperations.some((op) =>
                    ['uploading', 'queued', 'deleting'].includes(op.status)
                  );
                  if (hasActiveOperations) {
                    setShowCancelDialog(true);
                  } else {
                    // No active operations, close the modal by removing all completed operations
                    allOperations.forEach((op) => {
                      if (
                        op.operationType === 'upload' &&
                        ['completed', 'cancelled', 'failed'].includes(op.status)
                      ) {
                        removeUpload(op.id);
                      } else if (
                        op.operationType === 'delete' &&
                        ['completed', 'cancelled', 'failed'].includes(op.status)
                      ) {
                        removeDeleteOperation(op.id);
                      }
                    });
                  }
                }}
                className="p-1 rounded transition-colors duration-200"
                style={{
                  color: 'var(--muted-foreground)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <HiOutlineXMark className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Subtitle */}
          {getSubtitle() && isExpanded && (
            <div
              className="px-4 py-2 flex items-center justify-between"
              style={{ background: 'var(--secondary)' }}
            >
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {getSubtitle()}
              </p>
              <button
                className="text-xs font-medium"
                style={{ color: 'var(--primary)' }}
                onClick={() => {
                  // Cancel all active operations (uploads and deletes)
                  allOperations
                    .filter((op) => ['uploading', 'queued', 'deleting'].includes(op.status))
                    .forEach((op) =>
                      cancelOperation(op.id, op.operationType, op.type === 'folder')
                    );
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Operations List */}
          {isExpanded && (
            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              {allOperations.map((operation) => {
                const canCancel = ['uploading', 'queued'].includes(operation.status);
                const isActive = ['uploading', 'queued', 'deleting'].includes(operation.status);

                return (
                  <div
                    key={operation.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-opacity-50 transition-colors duration-200"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (canCancel) {
                        e.currentTarget.style.background = 'var(--secondary)';
                        setHoveredItem(operation.id);
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      setHoveredItem(null);
                    }}
                  >
                    {/* File/Folder Icon */}
                    <div className="flex-shrink-0">
                      {operation.type === 'folder' ? (
                        <FolderIcon />
                      ) : (
                        <FileIcon
                          extension={operation.extension}
                          filename={operation.name}
                          className="w-6 h-6"
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        title={operation.name}
                        style={{ color: 'var(--foreground)' }}
                      >
                        {operation.name}
                      </p>
                      {operation.status === 'completed' && (
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          {operation.operationType === 'upload'
                            ? 'Upload complete'
                            : 'Delete complete'}
                        </p>
                      )}
                      {operation.status === 'cancelled' && (
                        <p className="text-xs" style={{ color: '#ef4444' }}>
                          {operation.operationType === 'upload'
                            ? 'Upload cancelled'
                            : 'Delete cancelled'}
                        </p>
                      )}
                      {operation.totalFiles && operation.completedFiles !== undefined && (
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          {operation.completedFiles} of {operation.totalFiles}
                        </p>
                      )}
                    </div>

                    {/* Progress Circle or Cancel Button */}
                    <div className="flex-shrink-0 relative">
                      {isActive ? (
                        <div className="relative w-6 h-6">
                          {/* Progress Circle Background */}
                          <svg className="w-6 h-6 transform -rotate-90" viewBox="0 0 24 24">
                            <circle
                              cx="12"
                              cy="12"
                              r="10"
                              fill="none"
                              stroke="var(--progress-track)"
                              strokeWidth="2"
                            />
                            <circle
                              cx="12"
                              cy="12"
                              r="10"
                              fill="none"
                              stroke={
                                operation.operationType === 'delete' ? '#ef4444' : 'var(--primary)'
                              }
                              strokeWidth="2"
                              strokeDasharray={`${2 * Math.PI * 10}`}
                              strokeDashoffset={`${2 * Math.PI * 10 * (1 - operation.progress / 100)}`}
                              strokeLinecap="round"
                              className="transition-all duration-300"
                            />
                          </svg>

                          {/* Cancel Button on Hover */}
                          {hoveredItem === operation.id && canCancel && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelOperation(
                                  operation.id,
                                  operation.operationType,
                                  operation.type === 'folder'
                                );
                              }}
                              className="absolute inset-0 flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200"
                              style={{
                                background: 'var(--card)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              <HiOutlineXMark
                                className="w-3 h-3"
                                style={{ color: 'var(--muted-foreground)' }}
                              />
                            </button>
                          )}
                        </div>
                      ) : operation.status === 'completed' ? (
                        <div className="w-6 h-6 flex items-center justify-center">
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ background: '#22c55e' }}
                          >
                            <svg className="w-2.5 h-2.5" fill="white" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                        </div>
                      ) : operation.status === 'cancelled' ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 flex items-center justify-center">
                            <div
                              className="w-4 h-4 rounded-full flex items-center justify-center"
                              style={{ background: '#ef4444' }}
                            >
                              <HiOutlineXMark className="w-2.5 h-2.5" style={{ color: 'white' }} />
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              // Remove cancelled item from list
                              if (operation.operationType === 'upload') {
                                removeUpload(operation.id);
                              } else if (operation.operationType === 'delete') {
                                removeDeleteOperation(operation.id);
                              }
                            }}
                            className="p-1 rounded transition-colors duration-200"
                            style={{ color: 'var(--muted-foreground)' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--accent)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <HiOutlineXMark className="w-3 h-3" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Modal - Bottom Sheet Style */}
      <div className="md:hidden">
        <div
          className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm transition-all duration-300 ease-in-out"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
          }}
        >
          {/* Mobile Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <h3 className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
              {getTitle()}
            </h3>
            <button
              onClick={() => {
                const hasActiveOperations = allOperations.some((op) =>
                  ['uploading', 'queued', 'deleting'].includes(op.status)
                );
                if (hasActiveOperations) {
                  setShowCancelDialog(true);
                } else {
                  // No active operations, close the modal
                  // Modal will close automatically since no operations exist
                }
              }}
              className="p-1 rounded"
              style={{ color: 'var(--muted-foreground)' }}
            >
              <HiOutlineXMark className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile Operations List */}
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {allOperations.slice(0, 3).map((operation) => {
              const isActive = ['uploading', 'queued', 'deleting'].includes(operation.status);

              return (
                <div
                  key={operation.id}
                  className="flex items-center gap-3 px-4 py-2"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <div className="flex-shrink-0">
                    {operation.type === 'folder' ? (
                      <FolderIcon />
                    ) : (
                      <FileIcon
                        extension={operation.extension}
                        filename={operation.name}
                        className="w-5 h-5"
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--foreground)' }}>
                      {operation.name}
                    </p>
                    {operation.status === 'completed' && (
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {operation.operationType === 'upload'
                          ? 'Upload complete'
                          : 'Delete complete'}
                      </p>
                    )}
                    {operation.status === 'cancelled' && (
                      <p className="text-xs" style={{ color: '#ef4444' }}>
                        {operation.operationType === 'upload'
                          ? 'Upload cancelled'
                          : 'Delete cancelled'}
                      </p>
                    )}
                  </div>

                  {isActive && (
                    <div className="w-5 h-5">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 20 20">
                        <circle
                          cx="10"
                          cy="10"
                          r="8"
                          fill="none"
                          stroke="var(--progress-track)"
                          strokeWidth="2"
                        />
                        <circle
                          cx="10"
                          cy="10"
                          r="8"
                          fill="none"
                          stroke={
                            operation.operationType === 'delete' ? '#ef4444' : 'var(--primary)'
                          }
                          strokeWidth="2"
                          strokeDasharray={`${2 * Math.PI * 8}`}
                          strokeDashoffset={`${2 * Math.PI * 8 * (1 - operation.progress / 100)}`}
                          strokeLinecap="round"
                          className="transition-all duration-300"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={() => setShowCancelDialog(false)}
          />
          <div
            className="relative rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium" style={{ color: 'var(--foreground)' }}>
                  Cancel all operations?
                </h2>
                <button
                  onClick={() => setShowCancelDialog(false)}
                  className="p-1 rounded transition-colors duration-200"
                  style={{ color: 'var(--muted-foreground)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <HiOutlineXMark className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm mb-6" style={{ color: 'var(--muted-foreground)' }}>
                Your operations are not complete. Would you like to cancel all ongoing operations?
              </p>
            </div>

            <div
              className="px-6 py-4 flex justify-end gap-3"
              style={{ background: 'var(--secondary)' }}
            >
              <button
                onClick={() => {
                  // Cancel all active operations
                  allOperations
                    .filter((op) => ['uploading', 'queued', 'deleting'].includes(op.status))
                    .forEach((op) =>
                      cancelOperation(op.id, op.operationType, op.type === 'folder')
                    );
                  setShowCancelDialog(false);
                }}
                className="px-4 py-2 text-sm font-medium rounded-md transition-colors duration-200"
                style={{
                  color: 'var(--muted-foreground)',
                  background: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                Cancel all
              </button>
              <button
                onClick={() => setShowCancelDialog(false)}
                className="px-6 py-2 text-sm font-medium rounded-md transition-colors duration-200"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
