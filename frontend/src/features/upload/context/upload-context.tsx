'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { UploadStatus } from '@opndrive/s3-api';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';
import { useActiveUploadManager } from '@/hooks/use-auth';
import { createUploadExecutor, type UploadExecutor } from '../services/upload-executor';
import { createUploadEventBatcher } from '../services/upload-event-batcher';

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
  const updateUploads = useUploadStore((state) => state.updateUploads);
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

    // Batched rather than applied one by one: a large drop sends thousands of
    // events, and each store update copies every card. See the batcher.
    const batcher = createUploadEventBatcher(updateUploads);
    const handleEvent = (event: {
      id: string;
      status: UploadStatus;
      progress: number;
      error?: string;
    }) => batcher.push(event);

    uploadManager.on('statusChange', handleEvent);
    uploadManager.on('progress', handleEvent);

    return () => {
      uploadManager.off('statusChange', handleEvent);
      uploadManager.off('progress', handleEvent);
      // Whatever arrived in the last window still lands. The store ignores
      // events for cards a logout has already cleared.
      batcher.flush();
    };
  }, [uploadManager, updateUploads]);

  const value = useMemo(() => ({ executor }), [executor]);

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
};

export const useUploadContext = () => useContext(UploadContext);

/** The executor for the current session, or null before one exists. */
export const useUploadExecutor = () => useContext(UploadContext).executor;
