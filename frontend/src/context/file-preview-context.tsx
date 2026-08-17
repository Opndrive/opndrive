'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useDriveStore } from '@/context/data-context';
import {
  FilePreviewState,
  FilePreviewActions,
  PreviewableFile,
  PreviewConfig,
  toPreviewableFile,
} from '@/types/file-preview';

/** Query parameter naming the file currently on screen. */
export const PREVIEW_PARAM = 'preview';

/** The S3 key of a file, whichever of the two casings it arrived with. */
export function previewKeyOf(file: PreviewableFile): string {
  return file.key || file.Key || file.name;
}

/** Metadata the preview needs, as S3 hands it back. */
interface FileMetadata {
  ContentLength?: number;
  LastModified?: Date;
  ETag?: string;
  StorageClass?: string;
}

/**
 * Builds a previewable file from a key and its metadata.
 *
 * Used when a preview is restored from the URL, where the key is all we have:
 * a reload or a shared link arrives with no listing behind it.
 */
function fileFromMetadata(key: string, metadata: FileMetadata): PreviewableFile {
  const filename = key.split('/').pop() || 'unknown';
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  return {
    id: key,
    name: filename,
    key,
    Key: key,
    size: metadata.ContentLength || 0,
    Size: metadata.ContentLength || 0,
    type: extension,
    extension,
    lastModified: metadata.LastModified ? new Date(metadata.LastModified) : undefined,
    LastModified: metadata.LastModified?.toISOString(),
    ETag: metadata.ETag,
    StorageClass: metadata.StorageClass,
  };
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

  /**
   * The file behind a preview that arrived by link or reload, where there is
   * no listing to look it up in. Dropped as soon as a listing covers the key.
   */
  const [restored, setRestored] = useState<PreviewableFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const file =
    indexOfKey >= 0
      ? (files[indexOfKey] ?? null)
      : restored && previewKeyOf(restored) === previewKey
        ? restored
        : null;

  const { apiS3 } = useAuth();

  // Selected one at a time, so this provider does not re-render on every
  // unrelated change in the drive store.
  const currentPrefix = useDriveStore((state) => state.currentPrefix);
  const folderFiles = useDriveStore((state) =>
    state.currentPrefix ? state.cache[state.currentPrefix]?.files : undefined
  );

  /**
   * Fetches the one file a restored preview points at.
   *
   * Only the key survives in a URL, so a reload has nothing to render until
   * this lands. Deliberately does not wait for the folder listing: the file
   * the user linked to should paint as soon as it can, and the arrows arrive
   * with the listing below.
   */
  useEffect(() => {
    if (previewKey === null) {
      setRestored(null);
      setError(null);
      return;
    }
    // Already covered by a listing, or already fetched.
    if (indexOfKey >= 0) return;
    if (restored && previewKeyOf(restored) === previewKey) return;
    if (!apiS3) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    apiS3
      .fetchMetadata(previewKey)
      .then((metadata) => {
        if (cancelled) return;
        if (!metadata) {
          setError('File not found');
          return;
        }
        setRestored(fileFromMetadata(previewKey, metadata));
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load file');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [previewKey, indexOfKey, restored, apiS3]);

  /**
   * Hands the restored preview its neighbours once the folder listing lands,
   * so prev/next start working on a preview that was opened from a link.
   */
  useEffect(() => {
    if (previewKey === null || indexOfKey >= 0 || !folderFiles?.length) return;
    if (!folderFiles.some((f) => (f.Key || f.name) === previewKey)) return;

    setFiles(folderFiles.map(toPreviewableFile));
  }, [previewKey, indexOfKey, folderFiles, currentPrefix]);

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
    loading,
    error,
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
