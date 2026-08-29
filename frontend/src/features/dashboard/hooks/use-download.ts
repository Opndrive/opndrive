import { useCallback, useMemo } from 'react';
import { type DownloadProgress } from '../services/download-service';
import { useDownloadStore } from '../stores/use-download-store';
import { useNotification } from '@/context/notification-context';
import type { FileItem } from '@/features/dashboard/types/file';
import { useAuthGuard } from '@/hooks/use-auth-guard';

/**
 * How many files stream at once when several are downloaded together.
 *
 * Each in-flight download buffers its whole body in memory before handing it to
 * disk, so an unbounded fan-out over a multi-select turns straight into peak
 * RAM. Three keeps the pipe busy without letting a 20-file selection allocate
 * twenty file bodies at the same time.
 */
const MULTI_DOWNLOAD_CONCURRENCY = 3;

/** Runs `task` over `items`, keeping at most `limit` in flight. */
async function withConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await task(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Actions only - deliberately subscribes to no store state.
 *
 * Zustand action identities are stable, so components using this hook do not
 * re-render as progress ticks. This matters because the overflow menu mounts
 * once per file row: subscribing it to the downloads map would re-render every
 * row in the listing on every chunk of every download.
 */
export const useDownloadActions = () => {
  const { error: showError, info } = useNotification();
  const { apiS3 } = useAuthGuard();

  const startDownload = useDownloadStore((state) => state.startDownload);
  const cancelInStore = useDownloadStore((state) => state.cancelDownload);

  const handleError = useCallback(
    (_fileId: string, error: string) => {
      showError(error);
    },
    [showError]
  );

  const downloadFile = useCallback(
    async (file: FileItem) => {
      // Guarded here rather than by an early return above the hooks: bailing out
      // before the useCallbacks changed the hook count between renders once
      // apiS3 resolved, which React rejects outright.
      if (!apiS3) return;

      try {
        await startDownload(apiS3, file, { onError: handleError });
      } catch (error) {
        showError(`Failed to download ${file.name}, ${error}`);
      }
    },
    [apiS3, startDownload, handleError, showError]
  );

  const downloadMultipleFiles = useCallback(
    async (files: FileItem[]) => {
      if (!apiS3 || files.length === 0) return;

      info(`Downloading ${files.length} file${files.length > 1 ? 's' : ''}...`);
      await withConcurrency(files, MULTI_DOWNLOAD_CONCURRENCY, downloadFile);
    },
    [apiS3, downloadFile, info]
  );

  const cancelDownload = useCallback(
    (fileId: string) => {
      cancelInStore(fileId);
      info('Download cancelled');
    },
    [cancelInStore, info]
  );

  return { downloadFile, downloadMultipleFiles, cancelDownload };
};

/**
 * Subscribes to a single file's download state.
 *
 * The selector collapses to a boolean, so a row re-renders only when its own
 * download starts or stops - not on every progress update of every file.
 */
export const useIsFileDownloading = (fileId: string): boolean =>
  useDownloadStore((state) => {
    const status = state.downloads.get(fileId)?.status;
    return status === 'downloading' || status === 'pending' || status === 'queued';
  });

/**
 * Full download list. Only for the components that render progress UI - this
 * re-renders on every progress update by design.
 */
export const useDownloadList = () => {
  const downloads = useDownloadStore((state) => state.downloads);
  const { cancelDownload } = useDownloadActions();
  /**
   * Drops a settled row without touching the transfer, which is what a failed
   * download needs: cancelling one is a no-op because there is nothing left in
   * flight to abort, so the panels had no way to clear it. Selecting the action
   * on its own is free - zustand action identities are stable.
   */
  const removeDownload = useDownloadStore((state) => state.removeDownload);

  const downloadProgress = useMemo(() => Array.from(downloads.values()), [downloads]);
  const getAllDownloads = useCallback(
    (): DownloadProgress[] => downloadProgress,
    [downloadProgress]
  );

  return { downloadProgress, getAllDownloads, cancelDownload, removeDownload };
};
