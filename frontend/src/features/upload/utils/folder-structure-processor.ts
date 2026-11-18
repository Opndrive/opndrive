'use client';

import {
  FolderStructure,
  ProcessedDragData,
  SkippedEntry,
  WebKitEntry,
} from '../types/folder-upload-types';

/**
 * How many reads of a dropped folder are in flight at once.
 *
 * Each `file()` and `readEntries()` call is a round trip to the browser's file
 * system, and awaiting them one after another left a folder of thousands of
 * files taking that many round trips end to end. Bounded rather than all at
 * once, so a wide tree does not open thousands of readers together.
 */
const READ_CONCURRENCY = 16;

/** What reading one directory produced, in the order its entries came. */
interface DirectoryRead {
  files: File[];
  skipped: SkippedEntry[];
  /** Paths, from the drop, of the directories below with nothing in them. */
  emptyFolders: string[];
}

/**
 * Runs at most `limit` of the tasks handed to it at once.
 *
 * A finished task hands its place straight to the next one waiting, rather
 * than giving it up for that one to take. Given up, the place was free for
 * the moment before the woken task resumed, and a task arriving in that
 * moment took it as well: 17 reads at once against a limit of 16.
 */
export function createLimiter(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active < limit) active++;
    // Woken holding the place of the task that finished; see below.
    else await new Promise<void>((resolve) => waiting.push(resolve));

    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

type Limiter = ReturnType<typeof createLimiter>;

/**
 * The next batch of a directory's entries.
 *
 * `readEntries` hands back a batch at a time (100 in Chrome) and signals the
 * end with an empty one. A reader that throws instead of calling back, as
 * Chrome does with InvalidStateError when driven wrongly, rejects rather than
 * leaving the walk hanging.
 */
function readBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    try {
      reader.readEntries(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * One file of a dropped folder, stamped with its path from the drop.
 *
 * Never rejects. One unreadable file must not abandon the folder around it,
 * but it does have to be reported - see SkippedEntry.
 */
async function readFileEntry(
  entry: FileSystemFileEntry,
  path: string,
  limit: Limiter,
  onFileFound?: () => void
): Promise<DirectoryRead> {
  try {
    const file = await limit(
      () => new Promise<File>((resolve, reject) => entry.file(resolve, reject))
    );
    Object.defineProperty(file, 'webkitRelativePath', { value: path, writable: false });
    onFileFound?.();
    return { files: [file], skipped: [], emptyFolders: [] };
  } catch (fileError) {
    return {
      files: [],
      skipped: [{ kind: 'file', path, reason: describeReason(fileError, 'could not be read') }],
      emptyFolders: [],
    };
  }
}

export class FolderStructureProcessor {
  /**
   * Every file below a directory, each stamped with its path from the drop.
   *
   * Each batch of entries is set going as it arrives, files and
   * subdirectories alike, while the next batch is fetched, all within the
   * limiter's bound. The results are put back in entry order, so the outcome
   * is the same as reading them one by one, only sooner.
   *
   * @throws when the directory itself cannot be listed, or one of its entries
   * has been revoked mid-read. A file or subdirectory that cannot be read is
   * skipped and reported instead.
   */
  private static async readDirectoryRecursively(
    directoryEntry: FileSystemDirectoryEntry,
    basePath: string,
    limit: Limiter,
    onFileFound?: () => void
  ): Promise<DirectoryRead> {
    const reader = directoryEntry.createReader();
    // Each one settles with a result rather than rejecting, so a walk that
    // stops early leaves nothing unhandled behind it.
    const reads: Promise<DirectoryRead>[] = [];
    let isEmpty = true;

    for (;;) {
      const batch = await limit(() => readBatch(reader));
      if (batch.length === 0) break;
      isEmpty = false;

      for (const entry of batch) {
        const path = basePath ? `${basePath}/${entry.name}` : entry.name;

        // Touched here, before the next batch is asked for: an entry revoked
        // mid-read throws on access, and that has to stop this directory
        // rather than be left behind while reading carries on.
        if (entry.isFile) {
          reads.push(readFileEntry(entry as FileSystemFileEntry, path, limit, onFileFound));
        } else if (entry.isDirectory) {
          reads.push(
            this.readDirectoryRecursively(
              entry as FileSystemDirectoryEntry,
              path,
              limit,
              onFileFound
            ).catch((subDirError): DirectoryRead => ({
              files: [],
              skipped: [
                { kind: 'folder', path, reason: describeReason(subDirError, 'could not be read') },
              ],
              emptyFolders: [],
            }))
          );
        }
      }
    }

    // NOT `files.push(...read.files)`. Spreading passes each element as an
    // argument, and V8 throws RangeError past ~100k of them - which the caller's
    // catch would then swallow, dropping the whole subtree with one notice.
    // A directory with nothing in it at all. One that only holds files that
    // could not be read is not empty: its files are reported as skipped, and
    // creating it bare would pass for a successful upload of nothing.
    const merged: DirectoryRead = {
      files: [],
      skipped: [],
      emptyFolders: isEmpty ? [basePath] : [],
    };
    for (const read of await Promise.all(reads)) {
      appendAll(merged.files, read.files);
      appendAll(merged.skipped, read.skipped);
      appendAll(merged.emptyFolders, read.emptyFolders);
    }
    return merged;
  }

  /**
   * Turns a drop into loose files and folders.
   *
   * @param options.onFileFound called as each file of a dropped folder is
   * read, for showing progress on a large drop.
   */
  static async processDataTransferItems(
    items: DataTransferItemList,
    options: { onFileFound?: () => void } = {}
  ): Promise<ProcessedDragData> {
    const individualFiles: File[] = [];
    const folderStructures: FolderStructure[] = [];
    const skipped: SkippedEntry[] = [];
    // One bound for the whole drop, however many folders are in it.
    const limit = createLimiter(READ_CONCURRENCY);

    const processingPromises: Promise<void>[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.() as WebKitEntry | null;

        if (entry?.isDirectory) {
          const processDirectory = async () => {
            try {
              const read = await this.readDirectoryRecursively(
                entry as FileSystemDirectoryEntry,
                entry.name,
                limit,
                options.onFileFound
              );
              const folderFiles = read.files;
              appendAll(skipped, read.skipped);

              // Relative to the dropped folder, which is '' when it is the
              // empty one.
              const emptyFolders = read.emptyFolders.map((path) =>
                path === entry.name ? '' : path.slice(entry.name.length + 1)
              );

              // An empty folder is still something the user dropped. It used
              // to be left out here, and the drop did nothing at all.
              if (folderFiles.length > 0 || emptyFolders.length > 0) {
                const totalSize = folderFiles.reduce((sum, file) => sum + file.size, 0);

                folderStructures.push({
                  name: entry.name,
                  files: folderFiles,
                  totalSize,
                  relativePath: entry.name,
                  emptyFolders,
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
      } else {
        // Every loose file is kept, empty ones included. This used to skip any
        // empty file with no extension and no type, on the theory that it was
        // a folder the browser had turned into a file. A picker never does
        // that: the folder picker gives every file a path, which the branch
        // above groups, and the file picker cannot select a folder at all. So
        // the only things it ever skipped were real files - LICENSE,
        // Makefile, CODEOWNERS - and it skipped them without a word.
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
