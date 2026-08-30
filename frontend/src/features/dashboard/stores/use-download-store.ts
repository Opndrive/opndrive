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

  /**
   * A settled row stays until someone removes it.
   *
   * Downloads used to clear themselves on a timer - three seconds for a
   * completion, two for a cancel - which read as tidy until a failure needed
   * the same treatment. A reason for the failure that takes itself off the
   * screen is no use to anyone who was not looking at that moment, and the
   * panel can be collapsed. Uploads and deletes have always waited to be
   * dismissed; downloads now do too, and every settled row has a button on it.
   */
  startDownload: async (api, file, handlers) => {
    const { getService, setProgress } = get();

    await getService(api).downloadFile(file, {
      onProgress: setProgress,
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
