'use client';

import { FolderStructure, ProcessedDragData, WebKitEntry } from '../types/folder-upload-types';

export class FolderStructureProcessor {
  private static async readDirectoryRecursively(
    directoryEntry: FileSystemDirectoryEntry,
    basePath: string = ''
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
                  console.error(`Error reading file ${entry.name}:`, fileError);
                }
              } else if (entry.isDirectory) {
                const subPath = basePath ? `${basePath}/${entry.name}` : entry.name;

                try {
                  const subFiles = await this.readDirectoryRecursively(
                    entry as FileSystemDirectoryEntry,
                    subPath
                  );
                  files.push(...subFiles);
                } catch (subDirError) {
                  console.error(`Error reading directory ${entry.name}:`, subDirError);
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
                entry.name
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
              console.error(`Error processing directory ${entry.name}:`, error);
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

    return { individualFiles, folderStructures };
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

    return { individualFiles, folderStructures };
  }
}
