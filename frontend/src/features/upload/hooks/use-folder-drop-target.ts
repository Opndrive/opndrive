/**
 * Folder Drop Target Hook
 *
 * Handles drops onto specific folders in the file list
 */

'use client';

import { useCallback, useEffect } from 'react';
import { useEnhancedDragDrop } from '../providers/enhanced-drag-drop-provider';
import { DragDropTarget } from '../types/drag-drop-types';

interface UseFolderDropTargetProps {
  folder: {
    id: string;
    name: string;
    path: string;
  };
  onFilesDropped: (files: File[], folders: File[], targetFolder: DragDropTarget) => void;
}

export function useFolderDropTarget({ folder, onFilesDropped }: UseFolderDropTargetProps) {
  const { registerDropTarget, unregisterDropTarget, setHoverTarget, getTargetState, source } =
    useEnhancedDragDrop();

  const targetId = `folder-${folder.id}`;

  // Register this folder as a drop target
  useEffect(() => {
    const target: DragDropTarget = {
      type: 'folder',
      id: targetId,
      path: folder.path,
      name: folder.name,
    };

    registerDropTarget(target);

    return () => {
      unregisterDropTarget(targetId);
    };
  }, [folder.id, folder.name, folder.path, targetId, registerDropTarget, unregisterDropTarget]);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (source && source.type === 'external-files') {
        e.preventDefault();
        e.stopPropagation();

        setHoverTarget({
          type: 'folder',
          id: targetId,
          path: folder.path,
          name: folder.name,
        });
      }
    },
    [source, targetId, folder, setHoverTarget]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (source && source.type === 'external-files') {
        e.preventDefault();
        e.stopPropagation();

        // Only clear hover if we're actually leaving this element
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;

        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
          setHoverTarget(null);
        }
      }
    },
    [source, setHoverTarget]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (source && source.type === 'external-files') {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
      }
    },
    [source]
  );

  const readDirectoryContents = async (
    directoryEntry: FileSystemDirectoryEntry
  ): Promise<File[]> => {
    return new Promise((resolve, reject) => {
      const files: File[] = [];
      const reader = directoryEntry.createReader();

      const readEntries = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(files);
            return;
          }

          try {
            for (const entry of entries) {
              if (entry.isFile) {
                const fileEntry = entry as FileSystemFileEntry;
                const file = await new Promise<File>((resolveFile, rejectFile) => {
                  fileEntry.file(resolveFile, rejectFile);
                });

                const relativePath = entry.fullPath.substring(1);
                Object.defineProperty(file, 'webkitRelativePath', {
                  value: relativePath,
                  writable: false,
                });

                files.push(file);
              } else if (entry.isDirectory) {
                const subFiles = await readDirectoryContents(entry as FileSystemDirectoryEntry);
                files.push(...subFiles);
              }
            }

            readEntries();
          } catch (error) {
            reject(error);
          }
        }, reject);
      };

      readEntries();
    });
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (source && source.type === 'external-files' && e.dataTransfer) {
        e.preventDefault();
        e.stopPropagation();

        const files: File[] = [];
        const folders: File[] = [];

        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
          for (let i = 0; i < e.dataTransfer.items.length; i++) {
            const item = e.dataTransfer.items[i];

            if (item.kind === 'file') {
              const entry = item.webkitGetAsEntry?.();
              if (entry) {
                if (entry.isDirectory) {
                  const file = item.getAsFile();
                  if (file) {
                    folders.push(file);
                  }
                } else if (entry.isFile) {
                  const file = item.getAsFile();
                  if (file) {
                    files.push(file);
                  }
                }
              } else {
                const file = item.getAsFile();
                if (file) {
                  files.push(file);
                }
              }
            }
          }
        } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          Array.from(e.dataTransfer.files).forEach((file) => {
            const fileWithPath = file as File & { webkitRelativePath?: string };

            if (fileWithPath.webkitRelativePath && fileWithPath.webkitRelativePath.includes('/')) {
              folders.push(file);
            } else if (file.size === 0 && !file.type && !file.name.includes('.')) {
              folders.push(file);
            } else {
              files.push(file);
            }
          });
        }

        const target: DragDropTarget = {
          type: 'folder',
          id: targetId,
          path: folder.path,
          name: folder.name,
        };

        if (folders.length > 0 && e.dataTransfer.items) {
          const allFolderFiles: File[] = [];

          for (let i = 0; i < e.dataTransfer.items.length; i++) {
            const item = e.dataTransfer.items[i];
            if (item.kind === 'file') {
              const entry = item.webkitGetAsEntry?.();
              if (entry && entry.isDirectory) {
                const folderFiles = await readDirectoryContents(entry as FileSystemDirectoryEntry);
                allFolderFiles.push(...folderFiles);
              }
            }
          }

          onFilesDropped(files, allFolderFiles, target);
        } else {
          onFilesDropped(files, folders, target);
        }
        setHoverTarget(null);
      }
    },
    [source, targetId, folder, onFilesDropped, setHoverTarget]
  );

  const targetState = getTargetState(targetId);

  return {
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
    targetState,
    canAcceptDrop: targetState.canAcceptDrop && !!source,
  };
}
