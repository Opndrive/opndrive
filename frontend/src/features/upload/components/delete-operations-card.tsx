'use client';

import React from 'react';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';

export const DeleteOperationsCard: React.FC = () => {
  const { deletes } = useUploadStore();

  const deleteList = Object.values(deletes);

  if (deleteList.length === 0) {
    return null;
  }

  const stats = {
    total: deleteList.length,
    completed: deleteList.filter((d) => d.status === 'completed').length,
    deleting: deleteList.filter((d) => d.status === 'deleting').length,
    queued: deleteList.filter((d) => d.status === 'queued').length,
    failed: deleteList.filter((d) => d.status === 'failed').length,
    cancelled: deleteList.filter((d) => d.status === 'cancelled').length,
  };

  return (
    <Card className="fixed right-4 bottom-4 w-96 max-h-[80vh] shadow-xl border-2 z-50 bg-red-50/95 backdrop-blur-sm dark:bg-red-900/20 border-red-200 dark:border-red-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg font-semibold text-red-800 dark:text-red-200">
              Delete Operations ({stats.total})
            </CardTitle>
          </div>
        </div>

        {/* Delete Stats */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
            <div className="font-semibold text-green-700 dark:text-green-400">
              {stats.completed}
            </div>
            <div className="text-green-600 dark:text-green-500">Done</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
            <div className="font-semibold text-red-700 dark:text-red-400">
              {stats.deleting + stats.queued}
            </div>
            <div className="text-red-600 dark:text-red-500">Active</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-900/20">
            <div className="font-semibold text-gray-700 dark:text-gray-400">{stats.failed}</div>
            <div className="text-gray-600 dark:text-gray-500">Failed</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-3">
          {deleteList.map((deleteOp) => {
            return (
              <div
                key={deleteOp.id}
                className="border rounded-lg p-3 bg-white dark:bg-gray-800 border-red-200 dark:border-red-800"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-4 h-4 flex-shrink-0">
                      {deleteOp.type === 'folder' ? '🗑️📁' : '🗑️📄'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" title={deleteOp.name}>
                        {deleteOp.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {deleteOp.type === 'folder'
                          ? `Deleting Folder${deleteOp.totalFiles ? ` • ${deleteOp.totalFiles} files` : ''}`
                          : 'Deleting File'}
                        {deleteOp.isCalculatingSize && ' • Calculating size...'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <span
                      className={`px-2 py-1 text-xs font-bold uppercase tracking-wide rounded-full ${
                        deleteOp.status === 'completed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
                          : deleteOp.status === 'deleting'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'
                            : deleteOp.status === 'failed'
                              ? 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-200'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200'
                      }`}
                    >
                      {deleteOp.status}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                {['deleting', 'queued'].includes(deleteOp.status) && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>
                        {deleteOp.isCalculatingSize ? 'Calculating...' : 'Progress'}
                        {deleteOp.completedFiles &&
                          deleteOp.totalFiles &&
                          ` (${deleteOp.completedFiles}/${deleteOp.totalFiles})`}
                      </span>
                      <span>{Math.round(deleteOp.progress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          deleteOp.status === 'queued'
                            ? 'bg-gradient-to-r from-yellow-400 to-yellow-500'
                            : 'bg-gradient-to-r from-red-500 to-red-600'
                        }`}
                        style={{ width: `${deleteOp.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Error message for failed operations */}
                {deleteOp.status === 'failed' && deleteOp.error && (
                  <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-300">
                    {deleteOp.error}
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
