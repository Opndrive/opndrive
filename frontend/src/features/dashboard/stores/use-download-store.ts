/**
 * Shared download state.
 *
 * This lives in a store rather than in `useState` inside `useDownload` because
 * the components that *start* downloads (overflow menu, preview header/content,
 * multi-select actions) are disjoint from the ones that *display* them
 * (download progress manager, operations modal). With per-hook local state each
 * component held its own map and its own service instance, so the display
 * components rendered from a map that was never written to and their cancel
 * button addressed a service that never owned the download.
 */

import { create } from 'zustand';
import { BYOS3ApiProvider } from '@opndrive/s3-api';
import {
  createDownloadService,
  type DownloadProgress,
  type DownloadService,
} from '../services/download-service';
import type { FileItem } from '../types/file';

/** How long a finished row lingers before it clears itself from the list. */
const COMPLETED_LINGER_MS = 3000;
const CANCELLED_LINGER_MS = 2000;
/**
 * Longer than the other two, because a failure carries a reason worth reading.
 *
 * It does still leave. Errors had no linger at all, so a download that hit a
 * network problem stayed in the list until the page was reloaded, and neither
 * panel showing it offered a way to dismiss it by hand either.
 */
const ERROR_LINGER_MS = 8000;

interface DownloadState {
  downloads: Map<string, DownloadProgress>;
  /**
   * One service per API provider. Downloads track their AbortControllers inside
   * the service, so a single long-lived instance is what makes cancel reach the
   * in-flight request.
   */
  service: DownloadService | null;
  serviceApi: BYOS3ApiProvider | null;

  getService: (api: BYOS3ApiProvider) => DownloadService;
  setProgress: (progress: DownloadProgress) => void;
  removeDownload: (fileId: string) => void;
  startDownload: (
    api: BYOS3ApiProvider,
    file: FileItem,
    handlers?: { onError?: (fileId: string, error: string) => void }
  ) => Promise<void>;
  cancelDownload: (fileId: string) => void;
  getAllDownloads: () => DownloadProgress[];
  isDownloading: (fileId: string) => boolean;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  downloads: new Map(),
  service: null,
  serviceApi: null,

  getService: (api) => {
    const { service, serviceApi } = get();
    // Rebuild only when the credentials behind the provider actually change
    // (login/logout), otherwise reuse so in-flight controllers stay reachable.
    if (service && serviceApi === api) return service;

    const next = createDownloadService(api);
    set({ service: next, serviceApi: api });
    return next;
  },

  setProgress: (progress) =>
    set((state) => {
      const downloads = new Map(state.downloads);
      downloads.set(progress.fileId, progress);
      return { downloads };
    }),

  removeDownload: (fileId) =>
    set((state) => {
      if (!state.downloads.has(fileId)) return state;
      const downloads = new Map(state.downloads);
      downloads.delete(fileId);
      return { downloads };
    }),

  startDownload: async (api, file, handlers) => {
    const { getService, setProgress, removeDownload } = get();

    /**
     * Clears the row when its linger is up, unless it is no longer the row this
     * timer was set for.
     *
     * A retry reuses the file id, so an unguarded timer left over from an
     * attempt that already settled would delete the row of the one now running:
     * the panel would drop a live transfer, `isDownloading` would go false for
     * a file still being fetched, and starting it a third time would overwrite
     * the abort controller of the second, leaving that one uncancellable. Easy
     * to hit now that a failure lingers eight seconds and can be retried at
     * once, but the shorter delays could always race the same way.
     */
    const clearWhenSettled = (
      fileId: string,
      settledAs: DownloadProgress['status'],
      delay: number
    ) =>
      setTimeout(() => {
        if (get().downloads.get(fileId)?.status === settledAs) removeDownload(fileId);
      }, delay);

    await getService(api).downloadFile(file, {
      onProgress: (progress) => {
        setProgress(progress);
        if (progress.status === 'cancelled') {
          clearWhenSettled(file.id, 'cancelled', CANCELLED_LINGER_MS);
        }
        if (progress.status === 'error') {
          clearWhenSettled(file.id, 'error', ERROR_LINGER_MS);
        }
      },
      onComplete: (fileId) => {
        clearWhenSettled(fileId, 'completed', COMPLETED_LINGER_MS);
      },
      onError: handlers?.onError,
    });
  },

  cancelDownload: (fileId) => {
    // The service emits the 'cancelled' progress update itself when the abort
    // unwinds, which is also what schedules the row's removal.
    get().service?.cancelDownload(fileId);
  },

  getAllDownloads: () => Array.from(get().downloads.values()),

  isDownloading: (fileId) => {
    const status = get().downloads.get(fileId)?.status;
    return status === 'downloading' || status === 'pending' || status === 'queued';
  },
}));
