/**
 * Mocks for the drag-and-drop file APIs.
 *
 * Browsers expose dropped folders through the non-standard FileSystem Entry
 * API (`webkitGetAsEntry`, `createReader`, `readEntries`). jsdom implements
 * none of it, so anything touching dropped folders needs these.
 *
 * Two details are what make this a faithful mock rather than a convenient one,
 * and both are places real code breaks:
 *
 *  - `readEntries` is CALLBACK based, not promise based, and it hands back a
 *    BATCH at a time. Chrome caps that batch at 100 entries and you must keep
 *    calling the same reader until it answers with an empty array. A mock that
 *    returns everything in one call would let a caller that reads only once
 *    pass here and silently truncate at 100 files in production.
 *  - `FileSystemFileEntry.file()` is callback based too, with a separate error
 *    callback, which is how unreadable files surface.
 *
 * Nothing here touches globals, so there is nothing to restore between tests -
 * every helper returns a fresh object the caller owns.
 */

/** How many entries a real `readEntries` call returns at most. */
export const READ_ENTRIES_BATCH_SIZE = 100;

export interface MockFileEntry extends FileSystemFileEntry {
  /** Set to make `file()` invoke its error callback, as a locked file would. */
  failWith?: Error;
}

export interface MockDirectoryEntry extends FileSystemDirectoryEntry {
  /** Set to make `readEntries` invoke its error callback. */
  failWith?: Error;
  /** How many times `readEntries` has been called on readers from this entry. */
  readCallCount: () => number;
}

/**
 * A file entry wrapping a real `File`.
 *
 * `failWith` makes `file()` reject the way a deleted or permission-denied file
 * does mid-drop.
 */
export function mockFileEntry(file: File, options: { failWith?: Error } = {}): MockFileEntry {
  const entry = {
    isFile: true as const,
    isDirectory: false as const,
    name: file.name,
    fullPath: `/${file.name}`,
    filesystem: {} as FileSystem,
    failWith: options.failWith,
    file(onSuccess: (f: File) => void, onError?: (e: DOMException) => void) {
      // Callback based and asynchronous, like the real API.
      queueMicrotask(() => {
        if (options.failWith) onError?.(options.failWith as unknown as DOMException);
        else onSuccess(file);
      });
    },
    getParent: () => undefined,
  };
  return entry as unknown as MockFileEntry;
}

/**
 * A directory entry whose reader hands `children` back in batches.
 *
 * Each `createReader()` gets its own cursor, matching the real API where a
 * reader is single-use and drains its directory.
 */
export function mockDirectoryEntry(
  name: string,
  children: Array<MockFileEntry | MockDirectoryEntry>,
  options: { failWith?: Error; batchSize?: number; readDelayTicks?: number } = {}
): MockDirectoryEntry {
  const batchSize = options.batchSize ?? READ_ENTRIES_BATCH_SIZE;
  const delayTicks = options.readDelayTicks ?? 0;
  let readCalls = 0;

  const entry = {
    isFile: false as const,
    isDirectory: true as const,
    name,
    fullPath: `/${name}`,
    filesystem: {} as FileSystem,
    failWith: options.failWith,
    readCallCount: () => readCalls,
    createReader(): FileSystemDirectoryReader {
      let cursor = 0;
      return {
        readEntries(
          onSuccess: (entries: FileSystemEntry[]) => void,
          onError?: (e: DOMException) => void
        ) {
          readCalls++;
          // The batch is taken NOW, before any delay, so a slow reader cannot
          // race its own cursor.
          const batch = children.slice(cursor, cursor + batchSize);
          cursor += batch.length;

          // `readDelayTicks` lets a test make one directory finish after
          // another, which is how completion-order behaviour is exercised.
          let scheduled = Promise.resolve();
          for (let i = 0; i < delayTicks; i++) scheduled = scheduled.then(() => {});

          scheduled.then(() => {
            if (options.failWith) {
              onError?.(options.failWith as unknown as DOMException);
              return;
            }
            // An empty array means "done", which is the only way the caller
            // learns to stop asking.
            onSuccess(batch as unknown as FileSystemEntry[]);
          });
        },
      } as FileSystemDirectoryReader;
    },
    getParent: () => undefined,
  };
  return entry as unknown as MockDirectoryEntry;
}

/**
 * A `DataTransferItem` whose `webkitGetAsEntry` returns `entry`.
 *
 * `kind` defaults to 'file'. Pass 'string' to simulate dragged text, which the
 * processor must ignore.
 */
export function mockDataTransferItem(
  entry: FileSystemEntry | null,
  options: { kind?: 'file' | 'string'; file?: File | null; noGetAsEntry?: boolean } = {}
): DataTransferItem {
  const item = {
    kind: options.kind ?? 'file',
    type: '',
    getAsFile: () => options.file ?? null,
    getAsString: (cb?: (s: string) => void) => cb?.(''),
    // Older browsers do not implement this at all; the processor optional-calls
    // it, so the mock has to be able to be absent.
    ...(options.noGetAsEntry ? {} : { webkitGetAsEntry: () => entry }),
  };
  return item as unknown as DataTransferItem;
}

export interface MockDataTransferItemList extends DataTransferItemList {
  /**
   * Simulates the browser neutering the list once the drop handler returns.
   *
   * This is the sharpest edge of the real API: a `DataTransferItem` is only
   * valid during the synchronous part of the event. Read one after an `await`
   * and you get nothing, which is why extraction must call
   * `webkitGetAsEntry()` up front and hold the ENTRY (entries stay valid)
   * rather than holding the item.
   */
  neuter: () => void;
}

/**
 * A `DataTransferItemList`: array-like with a numeric index and `length`, which
 * is exactly what the processor's `for` loop walks.
 */
export function mockDataTransferItemList(items: DataTransferItem[]): MockDataTransferItemList {
  let live = true;
  const list: Record<number | string, unknown> & { length: number } = {
    length: items.length,
    neuter() {
      live = false;
      list.length = 0;
    },
  };

  items.forEach((item, index) => {
    Object.defineProperty(list, index, {
      enumerable: true,
      get() {
        if (!live) {
          throw new TypeError(
            'DataTransferItem accessed after the drop handler returned. Read entries synchronously.'
          );
        }
        return item;
      },
    });
  });

  return list as unknown as MockDataTransferItemList;
}

/** Convenience: a real `File` of a given size, so totalSize sums are meaningful. */
export function makeFile(name: string, size = 10, type = 'text/plain'): File {
  return new File([new Uint8Array(size)], name, { type });
}

/**
 * A `File` carrying `webkitRelativePath`, the shape `<input webkitdirectory>`
 * produces and what `processFileList` groups on.
 */
export function makeFileWithPath(name: string, relativePath: string, size = 10): File {
  const file = makeFile(name, size);
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
}
