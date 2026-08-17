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
 * Everything a preview needs that can be read straight off the key.
 *
 * A link or a reload carries nothing but the key, and this is enough to render
 * from: the viewers ask for their own signed URL, which needs the key alone.
 *
 * Deliberately not gated on a metadata call. Doing that made the preview depend
 * on HeadObject succeeding, which is a different permission from listing and,
 * from a browser, a different CORS method - so a bucket that lists fine and
 * serves images fine could still open to nothing at all.
 */
function fileFromKey(key: string): PreviewableFile {
  const name = key.split('/').pop() || 'unknown';
  const extension = name.split('.').pop()?.toLowerCase() || '';

  return {
    id: key,
    name,
    key,
    Key: key,
    size: 0,
    Size: 0,
    type: extension,
    extension,
  };
}

/** Fills in what only S3 knows. Enrichment, never a gate. */
function withMetadata(file: PreviewableFile, metadata: FileMetadata): PreviewableFile {
  return {
    ...file,
    size: metadata.ContentLength || 0,
    Size: metadata.ContentLength || 0,
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
  // `|| null` so an empty `?preview=` counts as no preview. Left as an empty
  // string it opens a file with no name, which is worse than not opening.
  const previewKey = searchParams.get(PREVIEW_PARAM) || null;
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

  /**
   * The file a link or reload points at, known from the key alone so the
   * preview opens immediately. `restored` replaces it once S3 has filled in
   * the size, and stands in for it if that never arrives.
   */
  const fromKey = useMemo(
    () => (previewKey === null ? null : fileFromKey(previewKey)),
    [previewKey]
  );

  const file =
    indexOfKey >= 0
      ? (files[indexOfKey] ?? null)
      : restored && previewKeyOf(restored) === previewKey
        ? restored
        : fromKey;

  const { apiS3 } = useAuth();

  // Selected one at a time, so this provider does not re-render on every
  // unrelated change in the drive store.
  const currentPrefix = useDriveStore((state) => state.currentPrefix);
  const folderFiles = useDriveStore((state) =>
    state.currentPrefix ? state.cache[state.currentPrefix]?.files : undefined
  );

  /**
   * Fills in the size of a file the preview only knows by key.
   *
   * The preview is already on screen by the time this runs - it exists to make
   * the size limit check meaningful, not to decide whether anything renders.
   * A bucket that refuses HeadObject still previews, it just does so without
   * the size gate, which beats showing nothing.
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
        if (cancelled || !metadata) return;
        setRestored(withMetadata(fileFromKey(previewKey), metadata));
      })
      .catch(() => {
        // Left to the viewer, which fetches the object itself and can say
        // something more useful about why it did not load.
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
