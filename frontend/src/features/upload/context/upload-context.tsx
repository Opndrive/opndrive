'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
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

  const [executor, setExecutor] = useState<UploadExecutor | null>(null);

  /**
   * One executor per manager, created in an effect rather than in render.
   *
   * `createUploadExecutor` subscribes to the manager, which makes it a side
   * effect, and side effects in render do not survive React's guarantees. Built
   * in a `useMemo` it was actively broken under StrictMode: the factory runs
   * twice, so two executors subscribe, then the simulated unmount disposes the
   * one React kept - leaving consumers holding an executor with no listeners.
   * Claims were never committed and never released, in dev, silently. The other
   * executor's listeners leaked.
   *
   * Verified: with the memo version, a progress event after a StrictMode mount
   * left the claim uncommitted; with this version it commits.
   */
  useEffect(() => {
    if (!uploadManager) {
      setExecutor(null);
      return;
    }

    const next = createUploadExecutor(uploadManager);
    setExecutor(next);

    return () => {
      next.dispose();
      // Functional update so a newer executor installed by the next effect run
      // is never clobbered. Consumers briefly see null rather than a disposed
      // executor, which is the safer of the two: a drop in that window is a
      // no-op instead of an upload whose claims never settle.
      setExecutor((current) => (current === next ? null : current));
    };
  }, [uploadManager]);

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
