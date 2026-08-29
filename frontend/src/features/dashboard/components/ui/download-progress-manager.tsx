'use client';

import React from 'react';
import { X, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { useDownloadList } from '@/features/dashboard/hooks/use-download';
import { cn } from '@/shared/utils/utils';
import { AriaLabel } from '@/shared/components/custom-aria-label';

export const DownloadProgressManager: React.FC = () => {
  const { getAllDownloads, cancelDownload, removeDownload } = useDownloadList();
  const downloads = getAllDownloads();

  if (downloads.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm space-y-2">
      {downloads.map((download) => (
        <DownloadProgressItem
          key={download.fileId}
          download={download}
          onCancel={() => cancelDownload(download.fileId)}
          onDismiss={() => removeDownload(download.fileId)}
        />
      ))}
    </div>
  );
};

interface DownloadProgressItemProps {
  download: {
    fileId: string;
    fileName: string;
    progress: number;
    status: 'queued' | 'pending' | 'downloading' | 'completed' | 'error' | 'cancelled';
    error?: string;
    queuePosition?: number;
  };
  onCancel: () => void;
  onDismiss: () => void;
}

const DownloadProgressItem: React.FC<DownloadProgressItemProps> = ({
  download,
  onCancel,
  onDismiss,
}) => {
  const getStatusIcon = () => {
    switch (download.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Download className="w-5 h-5 text-blue-500" />;
    }
  };

  const getStatusText = () => {
    switch (download.status) {
      case 'queued':
        return download.queuePosition
          ? `Queued (position ${download.queuePosition})`
          : 'Queued for download';
      case 'pending':
        return 'Starting download...';
      case 'downloading':
        return `${download.progress.toFixed(0)}% downloaded`;
      case 'completed':
        return 'Download completed';
      case 'cancelled':
        return 'Download cancelled';
      case 'error':
        return `Error: ${download.error || 'Download failed'}`;
      default:
        return 'Downloading...';
    }
  };

  /**
   * Still moving, so the button aborts it. Otherwise the transfer is over one
   * way or another and the button just clears the row away.
   */
  const isRunning =
    download.status === 'downloading' ||
    download.status === 'pending' ||
    download.status === 'queued';

  const shouldShowProgress = isRunning;

  return (
    <div
      className={cn(
        'bg-background border border-border rounded-lg shadow-lg p-3 min-w-[300px]',
        'animate-in slide-in-from-right-5 duration-300',
        download.status === 'completed' && 'animate-out slide-out-to-right-5 duration-500'
      )}
    >
      <div className="flex items-center gap-3">
        {getStatusIcon()}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">{download.fileName}</div>
          <div className="text-xs text-muted-foreground">{getStatusText()}</div>
          {shouldShowProgress && (
            <div className="mt-2 w-full bg-secondary rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${download.progress}%` }}
              />
            </div>
          )}
        </div>
        {/* Always offered. The button used to render only while a download was
            running, so a row that failed had no control on it at all and the
            only way to be rid of it was to reload the page. */}
        <AriaLabel
          label={
            isRunning ? `Cancel download of ${download.fileName}` : `Dismiss ${download.fileName}`
          }
          position="left"
        >
          <button
            onClick={isRunning ? onCancel : onDismiss}
            className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors p-1 rounded hover:bg-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </AriaLabel>
      </div>
    </div>
  );
};
