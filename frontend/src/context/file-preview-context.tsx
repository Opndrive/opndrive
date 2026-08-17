'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  FilePreviewState,
  FilePreviewActions,
  PreviewableFile,
  PreviewConfig,
} from '@/types/file-preview';

/** Query parameter naming the file currently on screen. */
export const PREVIEW_PARAM = 'preview';

/** The S3 key of a file, whichever of the two casings it arrived with. */
export function previewKeyOf(file: PreviewableFile): string {
  return file.key || file.Key || file.name;
}

const defaultConfig: PreviewConfig = {
  maxFileSizes: {
    image: 30 * 1024 * 1024, // 30MB
    pdf: 25 * 1024 * 1024, // 25MB
    document: 10 * 1024 * 1024, // 10MB
    code: 5 * 1024 * 1024, // 5MB
    video: 100 * 1024 * 1024, // 100MB
    audio: 50 * 1024 * 1024, // 50MB
  },
};

interface FilePreviewContextType extends FilePreviewState, FilePreviewActions {
  config: PreviewConfig;
}

const FilePreviewContext = createContext<FilePreviewContextType | undefined>(undefined);

interface FilePreviewProviderProps {
  children: React.ReactNode;
  config?: Partial<PreviewConfig>;
}

export function FilePreviewProvider({ children, config = {} }: FilePreviewProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /** The files the preview can arrow through, handed over by whoever opened it. */
  const [files, setFiles] = useState<PreviewableFile[]>([]);

  /**
   * The URL is the only record of whether a preview is open.
   *
   * It used to live in component state, which is why Back did not close the
   * preview - it left the folder instead, since folder navigation does push
   * URLs and the preview did not. With the parameter being the state, Back and
   * Forward work on their own and there is no second copy to keep in step.
   */
  const previewKey = searchParams.get(PREVIEW_PARAM);
  const isOpen = previewKey !== null;

  const indexOfKey = useMemo(
    () => (previewKey === null ? -1 : files.findIndex((f) => previewKeyOf(f) === previewKey)),
    [files, previewKey]
  );

  const file = indexOfKey >= 0 ? (files[indexOfKey] ?? null) : null;

  const urlWith = useCallback(
    (key: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key === null) {
        params.delete(PREVIEW_PARAM);
      } else {
        params.set(PREVIEW_PARAM, key);
      }
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname, searchParams]
  );

  /**
   * Whether opening added the history entry that closing can step back to.
   *
   * A preview reached by following a link or reloading did not add one, so
   * going back there would take the user out of the app entirely. That case
   * rewrites the URL instead.
   */
  const pushedRef = useRef(false);

  const openPreview = useCallback(
    (target: PreviewableFile, list: PreviewableFile[] = [target]) => {
      setFiles(list);
      pushedRef.current = true;
      router.push(urlWith(previewKeyOf(target)), { scroll: false });
    },
    [router, urlWith]
  );

  const closePreview = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      // Back rather than a new entry, so opening and closing a few previews
      // does not bury the folder behind history the user has to walk out of.
      router.back();
      return;
    }
    router.replace(urlWith(null), { scroll: false });
  }, [router, urlWith]);

  const navigateToFile = useCallback(
    (index: number) => {
      const next = files[index];
      if (!next) return;
      // replace, not push: arrowing through twenty files must not put twenty
      // entries between the user and the folder they started in.
      router.replace(urlWith(previewKeyOf(next)), { scroll: false });
    },
    [files, router, urlWith]
  );

  const currentIndex = Math.max(indexOfKey, 0);

  const navigateNext = useCallback(() => {
    if (indexOfKey >= 0 && indexOfKey < files.length - 1) {
      navigateToFile(indexOfKey + 1);
    }
  }, [indexOfKey, files.length, navigateToFile]);

  const navigatePrevious = useCallback(() => {
    if (indexOfKey > 0) {
      navigateToFile(indexOfKey - 1);
    }
  }, [indexOfKey, navigateToFile]);

  const mergedConfig: PreviewConfig = useMemo(
    () => ({
      maxFileSizes: {
        ...defaultConfig.maxFileSizes,
        ...config.maxFileSizes,
      },
    }),
    [config.maxFileSizes]
  );

  const value: FilePreviewContextType = {
    isOpen,
    file,
    files,
    currentIndex,
    loading: false,
    error: null,
    config: mergedConfig,
    openPreview,
    closePreview,
    navigateToFile,
    navigateNext,
    navigatePrevious,
  };

  return <FilePreviewContext.Provider value={value}>{children}</FilePreviewContext.Provider>;
}

export function useFilePreview() {
  const context = useContext(FilePreviewContext);
  if (context === undefined) {
    throw new Error('useFilePreview must be used within a FilePreviewProvider');
  }
  return context;
}
