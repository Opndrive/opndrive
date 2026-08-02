'use client';

import {
  FolderStructure,
  ProcessedDragData,
  SkippedEntry,
  WebKitEntry,
} from '../types/folder-upload-types';

export class FolderStructureProcessor {
  private static async readDirectoryRecursively(
    directoryEntry: FileSystemDirectoryEntry,
    basePath: string = '',
    skipped: SkippedEntry[] = []
  ): Promise<File[]> {
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
                try {
                  const file = await new Promise<File>((resolveFile, rejectFile) => {
                    fileEntry.file(resolveFile, rejectFile);
                  });

                  const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

                  Object.defineProperty(file, 'webkitRelativePath', {
                    value: relativePath,
                    writable: false,
                  });

                  files.push(file);
                } catch (fileError) {
                  // One unreadable file must not abandon the folder around it,
                  // but it does have to be reported - see SkippedEntry.
                  skipped.push({
                    kind: 'file',
                    path: basePath ? `${basePath}/${entry.name}` : entry.name,
                    reason: describeReason(fileError, 'could not be read'),
                  });
                }
              } else if (entry.isDirectory) {
                const subPath = basePath ? `${basePath}/${entry.name}` : entry.name;

                try {
                  const subFiles = await this.readDirectoryRecursively(
                    entry as FileSystemDirectoryEntry,
                    subPath,
                    skipped
                  );
                  // NOT `files.push(...subFiles)`. Spreading passes each element
                  // as an argument, and V8 throws RangeError past ~100k of them
                  // - which this very catch would then swallow, dropping the
                  // whole subtree from the upload with only a log line.
                  appendAll(files, subFiles);
                } catch (subDirError) {
                  skipped.push({
                    kind: 'folder',
                    path: subPath,
                    reason: describeReason(subDirError, 'could not be read'),
                  });
                }
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
  }

  static async processDataTransferItems(items: DataTransferItemList): Promise<ProcessedDragData> {
    const individualFiles: File[] = [];
    const folderStructures: FolderStructure[] = [];
    const skipped: SkippedEntry[] = [];

    const processingPromises: Promise<void>[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.() as WebKitEntry | null;

        if (entry?.isDirectory) {
          const processDirectory = async () => {
            try {
              const folderFiles = await this.readDirectoryRecursively(
                entry as FileSystemDirectoryEntry,
                entry.name,
                skipped
              );

              if (folderFiles.length > 0) {
                const totalSize = folderFiles.reduce((sum, file) => sum + file.size, 0);

                folderStructures.push({
                  name: entry.name,
                  files: folderFiles,
                  totalSize,
                  relativePath: entry.name,
                });
              }
            } catch (error) {
              skipped.push({
                kind: 'folder',
                path: entry.name,
                reason: describeReason(error, 'could not be read'),
              });
            }
          };

          processingPromises.push(processDirectory());
        } else if (entry?.isFile) {
          const file = item.getAsFile();
          if (file) {
            individualFiles.push(file);
          }
        } else {
          const file = item.getAsFile();
          if (file) {
            individualFiles.push(file);
          }
        }
      }
    }

    await Promise.all(processingPromises);

    return { individualFiles, folderStructures, skipped };
  }

  static processFileList(files: FileList | File[]): ProcessedDragData {
    const individualFiles: File[] = [];
    const folderMap = new Map<string, File[]>();

    const fileArray = Array.from(files);

    fileArray.forEach((file) => {
      const fileWithPath = file as File & { webkitRelativePath?: string };

      if (fileWithPath.webkitRelativePath && fileWithPath.webkitRelativePath.includes('/')) {
        const pathParts = fileWithPath.webkitRelativePath.split('/');
        const folderName = pathParts[0];

        if (!folderMap.has(folderName)) {
          folderMap.set(folderName, []);
        }
        folderMap.get(folderName)?.push(file);
      } else if (file.size === 0 && !file.type && !file.name.includes('.')) {
        // Likely an empty folder - skip for now
      } else {
        individualFiles.push(file);
      }
    });

    const folderStructures: FolderStructure[] = Array.from(folderMap.entries()).map(
      ([folderName, folderFiles]) => ({
        name: folderName,
        files: folderFiles,
        totalSize: folderFiles.reduce((sum, file) => sum + file.size, 0),
        relativePath: folderName,
      })
    );

    return { individualFiles, folderStructures, skipped: [] };
  }
}

/** Turns whatever was thrown into something worth showing a user. */
function describeReason(error: unknown, fallback: string): string {
  if (error instanceof DOMException || error instanceof Error) {
    return error.message ? `${fallback} (${error.message})` : fallback;
  }
  return fallback;
}

/**
 * `target.push(...source)` for arrays that may be enormous.
 *
 * Spread passes every element as a separate argument, and V8 throws
 * `RangeError: Maximum call stack size exceeded` somewhere past 100k of them.
 */
function appendAll<T>(target: T[], source: readonly T[]): void {
  for (const item of source) target.push(item);
}
