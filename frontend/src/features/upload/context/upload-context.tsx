'use client';

import React, { createContext, useContext, useEffect, useMemo, ReactNode } from 'react';
import { UploadStatus } from '@opndrive/s3-api';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import { useActiveUploadManager } from '@/hooks/use-auth';
import { createUploadExecutor, type UploadExecutor } from '../services/upload-executor';

interface UploadContextValue {
  /**
   * Null until a session exists, and replaced whenever the active manager
   * changes - switching upload mode or bucket builds a new one.
   */
  executor: UploadExecutor | null;
}

/**
 * Defaulted rather than null so `useUploadContext` outside a provider returns
 * a usable shape instead of throwing. The previous version created the context
 * with `null` and then threw whenever the value was falsy, which meant the hook
 * threw unconditionally - it was simply never called.
 */
const UploadContext = createContext<UploadContextValue>({ executor: null });

export const UploadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Field selector: this provider wraps the whole dashboard, so subscribing to
  // the entire upload store would re-render every page on each progress tick.
  const updateUpload = useUploadStore((state) => state.updateUpload);
  const uploadManager = useActiveUploadManager();

  // One executor per manager. The manager is a singleton held in auth context,
  // so this only rebuilds when the session or upload mode actually changes.
  const executor = useMemo(
    () => (uploadManager ? createUploadExecutor(uploadManager) : null),
    [uploadManager]
  );

  // Disposal is keyed on the executor itself rather than the manager, so a
  // superseded executor unsubscribes before the replacement takes over and the
  // two never both react to the same event.
  useEffect(() => () => executor?.dispose(), [executor]);

  useEffect(() => {
    if (!uploadManager) return;
    const handleStatusChange = ({
      id,
      status,
      progress,
    }: {
      id: string;
      status: UploadStatus;
      progress: number;
    }) => {
      updateUpload(id, { status, progress });
    };

    const handleProgress = ({
      id,
      progress,
      status,
    }: {
      id: string;
      progress: number;
      status: UploadStatus;
    }) => {
      updateUpload(id, { progress, status });
    };

    uploadManager.on('statusChange', handleStatusChange);
    uploadManager.on('progress', handleProgress);

    // Clean up the subscription when the component unmounts
    return () => {
      uploadManager.off('statusChange', handleStatusChange);
      uploadManager.off('progress', handleProgress);
    };
  }, [uploadManager, updateUpload]);

  const value = useMemo(() => ({ executor }), [executor]);

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
};

export const useUploadContext = () => useContext(UploadContext);

/** The executor for the current session, or null before one exists. */
export const useUploadExecutor = () => useContext(UploadContext).executor;
