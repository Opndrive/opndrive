'use client';

import React from 'react';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { useActiveUploadManager } from '@/hooks/use-auth';

export const UploadOperationsCard: React.FC = () => {
  const { uploads } = useUploadStore();
  const uploadManager = useActiveUploadManager();

  if (!uploadManager) {
    return 'Loading...';
  }

  // Helper function to cancel folder
  const cancelFolder = (folderId: string) => {
    const folder = uploads[folderId];
    if (folder && folder.fileIds) {
      folder.fileIds.forEach((fileId) => {
        uploadManager.cancelUpload(fileId);
      });
      folder.status = 'cancelled';
    }
  };

  // Calculate folder progress based on its files
  const getFolderProgress = (folderId: string): number => {
    const folder = uploads[folderId];
    if (!folder || !folder.fileIds) return 0;

    const fileProgresses = folder.fileIds.map((id) => uploads[id]?.progress || 0);
    return fileProgresses.reduce((sum, progress) => sum + progress, 0) / fileProgresses.length;
  };

  const uploadList = Object.values(uploads);
  const folders = uploadList.filter((u) => u.type === 'folder');
  const individualFiles = uploadList.filter((u) => u.type === 'file' && !u.parentFolderId);

  // Only show folders and individual files (not files within folders)
  const displayItems = [...folders, ...individualFiles];

  if (displayItems.length === 0) {
    return null;
  }

  const stats = {
    total: displayItems.length,
    completed: displayItems.filter((u) => u.status === 'completed').length,
    uploading: displayItems.filter((u) => u.status === 'uploading').length,
    queued: displayItems.filter((u) => u.status === 'queued').length,
    paused: displayItems.filter((u) => u.status === 'paused').length,
    failed: displayItems.filter((u) => u.status === 'failed').length,
    cancelled: displayItems.filter((u) => u.status === 'cancelled').length,
  };

  return (
    <Card className="fixed left-4 bottom-4 w-96 max-h-[80vh] shadow-xl border-2 z-50 bg-white/95 backdrop-blur-sm dark:bg-gray-900/95">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-semibold">Uploads ({stats.total})</CardTitle>
          </div>
        </div>

        {/* Upload Stats */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
            <div className="font-semibold text-green-700 dark:text-green-400">
              {stats.completed}
            </div>
            <div className="text-green-600 dark:text-green-500">Done</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <div className="font-semibold text-blue-700 dark:text-blue-400">
              {stats.uploading + stats.queued}
            </div>
            <div className="text-blue-600 dark:text-blue-500">Active</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
            <div className="font-semibold text-red-700 dark:text-red-400">{stats.failed}</div>
            <div className="text-red-600 dark:text-red-500">Failed</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-3">
          {displayItems.map((upload) => {
            const isFolder = upload.type === 'folder';
            const displayProgress = isFolder ? getFolderProgress(upload.id) : upload.progress;

            return (
              <div key={upload.id} className="border rounded-lg p-3 bg-white dark:bg-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-4 h-4 flex-shrink-0">
                      {upload.type === 'folder' ? '📁' : '📄'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" title={upload.name}>
                        {upload.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {upload.type === 'folder'
                          ? `Folder • ${upload.fileIds?.length || 0} files`
                          : 'File'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 text-xs font-bold uppercase tracking-wide rounded-full ${
                        upload.status === 'completed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
                          : upload.status === 'uploading'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200'
                            : upload.status === 'paused'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200'
                              : upload.status === 'failed'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-200'
                      }`}
                    >
                      {upload.status}
                    </span>

                    {/* Action Buttons */}
                    <div className="flex gap-1">
                      {isFolder ? (
                        // Folder cancel button only
                        ['uploading', 'paused', 'queued'].includes(upload.status) && (
                          <button
                            onClick={() => cancelFolder(upload.id)}
                            className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md text-xs"
                            title="Cancel Folder"
                          >
                            ❌
                          </button>
                        )
                      ) : (
                        // Individual file action buttons
                        <>
                          {(upload.status === 'uploading' || upload.status === 'queued') && (
                            <button
                              onClick={() => uploadManager.pauseUpload(upload.id)}
                              className="p-1.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md text-xs"
                              title="Pause"
                            >
                              ⏸️
                            </button>
                          )}

                          {upload.status === 'paused' && (
                            <button
                              onClick={() => uploadManager.resumeUpload(upload.id)}
                              className="p-1.5 bg-green-500 hover:bg-green-600 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md text-xs"
                              title="Resume"
                            >
                              ▶️
                            </button>
                          )}

                          {['uploading', 'paused', 'queued'].includes(upload.status) && (
                            <button
                              onClick={() => uploadManager.cancelUpload(upload.id)}
                              className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md transition-all duration-200 shadow-sm hover:shadow-md text-xs"
                              title="Cancel"
                            >
                              ❌
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                {['uploading', 'paused', 'queued'].includes(upload.status) && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Progress</span>
                      <span>{Math.round(displayProgress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          upload.status === 'paused'
                            ? 'bg-gradient-to-r from-yellow-400 to-yellow-500'
                            : upload.status === 'queued'
                              ? 'bg-gradient-to-r from-gray-400 to-gray-500'
                              : 'bg-gradient-to-r from-blue-500 to-blue-600'
                        }`}
                        style={{ width: `${displayProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
