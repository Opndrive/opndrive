'use client';

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import {
  FilePreviewState,
  FilePreviewActions,
  PreviewableFile,
  PreviewConfig,
} from '@/types/file-preview';

type FilePreviewAction =
  | {
      type: 'OPEN_PREVIEW';
      payload: { file: PreviewableFile; files: PreviewableFile[]; index: number };
    }
  | { type: 'CLOSE_PREVIEW' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'NAVIGATE_TO_FILE'; payload: number };

const initialState: FilePreviewState = {
  isOpen: false,
  file: null,
  files: [],
  currentIndex: 0,
  loading: false,
  error: null,
};

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

function filePreviewReducer(state: FilePreviewState, action: FilePreviewAction): FilePreviewState {
  switch (action.type) {
    case 'OPEN_PREVIEW':
      return {
        ...state,
        isOpen: true,
        file: action.payload.file,
        files: action.payload.files,
        currentIndex: action.payload.index,
        loading: true,
        error: null,
      };

    case 'CLOSE_PREVIEW':
      return {
        ...initialState,
      };

    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        loading: false,
      };

    case 'NAVIGATE_TO_FILE': {
      const newIndex = action.payload;
      const newFile = state.files[newIndex];
      return {
        ...state,
        currentIndex: newIndex,
        file: newFile || null,
        loading: true,
        error: null,
      };
    }

    default:
      return state;
  }
}

interface FilePreviewContextType extends FilePreviewState, FilePreviewActions {
  config: PreviewConfig;
}

const FilePreviewContext = createContext<FilePreviewContextType | undefined>(undefined);

interface FilePreviewProviderProps {
  children: React.ReactNode;
  config?: Partial<PreviewConfig>;
}

export function FilePreviewProvider({ children, config = {} }: FilePreviewProviderProps) {
  const [state, dispatch] = useReducer(filePreviewReducer, initialState);

  const mergedConfig: PreviewConfig = {
    maxFileSizes: {
      ...defaultConfig.maxFileSizes,
      ...config.maxFileSizes,
    },
  };

  const openPreview = useCallback((file: PreviewableFile, files: PreviewableFile[] = [file]) => {
    const fileIndex = files.findIndex((f) => f.id === file.id);
    const index = fileIndex >= 0 ? fileIndex : 0;

    dispatch({
      type: 'OPEN_PREVIEW',
      payload: { file, files, index },
    });
  }, []);

  const closePreview = useCallback(() => {
    dispatch({ type: 'CLOSE_PREVIEW' });
  }, []);

  const navigateToFile = useCallback(
    (index: number) => {
      if (index >= 0 && index < state.files.length) {
        dispatch({ type: 'NAVIGATE_TO_FILE', payload: index });
      }
    },
    [state.files.length]
  );

  const navigateNext = useCallback(() => {
    if (state.currentIndex < state.files.length - 1) {
      navigateToFile(state.currentIndex + 1);
    }
  }, [state.currentIndex, state.files.length, navigateToFile]);

  const navigatePrevious = useCallback(() => {
    if (state.currentIndex > 0) {
      navigateToFile(state.currentIndex - 1);
    }
  }, [state.currentIndex, navigateToFile]);

  const value: FilePreviewContextType = {
    ...state,
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
