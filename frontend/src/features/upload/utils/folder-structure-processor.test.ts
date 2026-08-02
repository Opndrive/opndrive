/**
 * Folder structure processor: turns a drop into files and folders.
 *
 * Two entry points, two very different worlds:
 *
 *  - `processDataTransferItems` walks the FileSystem Entry API a browser hands
 *    you on a drop. Callback based, batched, recursive.
 *  - `processFileList` handles `<input webkitdirectory>`, where the browser has
 *    already flattened everything and the structure lives in
 *    `webkitRelativePath`.
 *
 * The mocks live in src/tests/dnd-mocks.ts and deliberately batch `readEntries`
 * the way Chrome does, because a reader that is only called once silently
 * truncates a large folder at 100 files.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FolderStructureProcessor } from './folder-structure-processor';
import {
  makeFile,
  makeFileWithPath,
  mockDataTransferItem,
  mockDataTransferItemList,
  mockDirectoryEntry,
  mockFileEntry,
  READ_ENTRIES_BATCH_SIZE,
} from '@/tests/dnd-mocks';

const process = (items: DataTransferItem[]) =>
  FolderStructureProcessor.processDataTransferItems(mockDataTransferItemList(items));

/** Every file the walk found, by its assigned relative path. */
const pathsOf = (files: File[]) =>
  files.map((f) => (f as File & { webkitRelativePath: string }).webkitRelativePath);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('dropping loose files', () => {
  it('collects a single dropped file', async () => {
    const file = makeFile('report.pdf');
    const item = mockDataTransferItem(mockFileEntry(file), { file });

    const result = await process([item]);

    expect(result.individualFiles).toEqual([file]);
    expect(result.folderStructures).toEqual([]);
  });

  it('collects several files', async () => {
    const a = makeFile('a.txt');
    const b = makeFile('b.txt');

    const result = await process([
      mockDataTransferItem(mockFileEntry(a), { file: a }),
      mockDataTransferItem(mockFileEntry(b), { file: b }),
    ]);

    expect(result.individualFiles).toEqual([a, b]);
  });

  it('ignores dragged text', async () => {
    const result = await process([mockDataTransferItem(null, { kind: 'string' })]);

    // Dragging a text selection onto the dropzone must not start an upload.
    expect(result.individualFiles).toEqual([]);
    expect(result.folderStructures).toEqual([]);
  });

  it('falls back to getAsFile when the entry API is missing', async () => {
    const file = makeFile('legacy.txt');
    const item = mockDataTransferItem(null, { file, noGetAsEntry: true });

    // Older browsers do not implement webkitGetAsEntry; the file still uploads.
    const result = await process([item]);

    expect(result.individualFiles).toEqual([file]);
  });

  it('falls back to getAsFile when the entry is neither file nor directory', async () => {
    const file = makeFile('odd.txt');
    const weirdEntry = { isFile: false, isDirectory: false, name: 'odd.txt' };
    const item = mockDataTransferItem(weirdEntry as unknown as FileSystemEntry, { file });

    const result = await process([item]);

    expect(result.individualFiles).toEqual([file]);
  });

  it('skips an item that yields no file at all', async () => {
    const item = mockDataTransferItem(null, { file: null });

    expect(await process([item])).toEqual({
      individualFiles: [],
      folderStructures: [],
      skipped: [],
    });
  });

  it('handles an empty drop', async () => {
    expect(await process([])).toEqual({ individualFiles: [], folderStructures: [], skipped: [] });
  });
});

describe('dropping a folder', () => {
  it('extracts the files inside it', async () => {
    const a = makeFile('a.txt', 100);
    const b = makeFile('b.txt', 200);
    const dir = mockDirectoryEntry('docs', [mockFileEntry(a), mockFileEntry(b)]);

    const result = await process([mockDataTransferItem(dir)]);

    expect(result.individualFiles).toEqual([]);
    expect(result.folderStructures).toHaveLength(1);
    expect(result.folderStructures[0]).toMatchObject({
      name: 'docs',
      relativePath: 'docs',
      totalSize: 300,
    });
    expect(result.folderStructures[0]!.files).toHaveLength(2);
  });

  it('prefixes each file with the folder path', async () => {
    const dir = mockDirectoryEntry('docs', [mockFileEntry(makeFile('a.txt'))]);

    const result = await process([mockDataTransferItem(dir)]);

    // The upload keys are built from webkitRelativePath, so losing the prefix
    // would flatten the folder into the destination root.
    expect(pathsOf(result.folderStructures[0]!.files)).toEqual(['docs/a.txt']);
  });

  it('recurses into nested folders', async () => {
    const deep = mockDirectoryEntry('deep', [mockFileEntry(makeFile('d.txt'))]);
    const nested = mockDirectoryEntry('nested', [mockFileEntry(makeFile('n.txt')), deep]);
    const root = mockDirectoryEntry('root', [mockFileEntry(makeFile('r.txt')), nested]);

    const result = await process([mockDataTransferItem(root)]);

    expect(pathsOf(result.folderStructures[0]!.files).sort()).toEqual([
      'root/nested/deep/d.txt',
      'root/nested/n.txt',
      'root/r.txt',
    ]);
  });

  it('keeps recursing past the readEntries batch limit', async () => {
    // Chrome hands back at most 100 entries per call and expects you to keep
    // asking. A processor that read once would silently drop everything after
    // the 100th file - the single most likely bug in this code.
    const children = Array.from({ length: 250 }, (_, i) => mockFileEntry(makeFile(`f${i}.txt`)));
    const dir = mockDirectoryEntry('big', children, { batchSize: READ_ENTRIES_BATCH_SIZE });

    const result = await process([mockDataTransferItem(dir)]);

    expect(result.folderStructures[0]!.files).toHaveLength(250);
    // 3 batches (100/100/50) plus the empty read that signals the end.
    expect(dir.readCallCount()).toBe(4);
  });

  it('skips a folder that contains nothing', async () => {
    const empty = mockDirectoryEntry('empty', []);

    const result = await process([mockDataTransferItem(empty)]);

    // Creating a zero-file upload would leave a phantom folder in the UI.
    expect(result.folderStructures).toEqual([]);
  });

  it('skips a folder whose subfolders are all empty', async () => {
    const dir = mockDirectoryEntry('outer', [mockDirectoryEntry('inner', [])]);

    const result = await process([mockDataTransferItem(dir)]);

    expect(result.folderStructures).toEqual([]);
  });

  it('sums the total size across nested folders', async () => {
    const inner = mockDirectoryEntry('inner', [mockFileEntry(makeFile('b.txt', 50))]);
    const dir = mockDirectoryEntry('outer', [mockFileEntry(makeFile('a.txt', 25)), inner]);

    const result = await process([mockDataTransferItem(dir)]);

    expect(result.folderStructures[0]!.totalSize).toBe(75);
  });

  it('handles a mixed drop of files and folders', async () => {
    const loose = makeFile('loose.txt');
    const dir = mockDirectoryEntry('docs', [mockFileEntry(makeFile('a.txt'))]);

    const result = await process([
      mockDataTransferItem(mockFileEntry(loose), { file: loose }),
      mockDataTransferItem(dir),
    ]);

    expect(result.individualFiles).toEqual([loose]);
    expect(result.folderStructures.map((f) => f.name)).toEqual(['docs']);
  });

  it('processes several folders concurrently', async () => {
    const one = mockDirectoryEntry('one', [mockFileEntry(makeFile('a.txt'))]);
    const two = mockDirectoryEntry('two', [mockFileEntry(makeFile('b.txt'))]);

    const result = await process([mockDataTransferItem(one), mockDataTransferItem(two)]);

    // Both are awaited together, so neither is lost.
    expect(result.folderStructures.map((f) => f.name).sort()).toEqual(['one', 'two']);
  });

  it('reads every DataTransferItem before the first await', async () => {
    // A DataTransferItem is only valid during the synchronous part of the drop
    // event; the browser neuters the list the moment the handler returns.
    // Extraction therefore has to read webkitGetAsEntry() up front and hold the
    // ENTRY, which stays valid. Neutering the list right after the call proves
    // nothing is read late - if someone moves that read behind an await, this
    // fails here instead of only in a real browser.
    const dir = mockDirectoryEntry('docs', [mockFileEntry(makeFile('a.txt'))]);
    const list = mockDataTransferItemList([mockDataTransferItem(dir)]);

    const pending = FolderStructureProcessor.processDataTransferItems(list);
    list.neuter();

    await expect(pending).resolves.toMatchObject({
      folderStructures: [expect.objectContaining({ name: 'docs' })],
    });
  });

  it('KNOWN GAP: folders come back in completion order, not drop order', async () => {
    const slow = mockDirectoryEntry('dropped-first', [mockFileEntry(makeFile('a.txt'))], {
      readDelayTicks: 40,
    });
    const fast = mockDirectoryEntry('dropped-second', [mockFileEntry(makeFile('b.txt'))]);

    const result = await process([mockDataTransferItem(slow), mockDataTransferItem(fast)]);

    // Each folder pushes itself when its own walk finishes, so a large folder
    // dropped first appears after a small one dropped second. Harmless for
    // correctness - every file still uploads - but the operations list shows
    // them in an order the user did not choose.
    //
    // Pinned, not endorsed: collecting results positionally (map to indexed
    // slots rather than push) would make this fail.
    expect(result.folderStructures.map((f) => f.name)).toEqual(['dropped-second', 'dropped-first']);
  });

  it('KNOWN GAP: two dropped folders sharing a name stay separate', async () => {
    const first = mockDirectoryEntry('photos', [mockFileEntry(makeFile('a.txt'))]);
    const second = mockDirectoryEntry('photos', [mockFileEntry(makeFile('b.txt'))]);

    const result = await process([mockDataTransferItem(first), mockDataTransferItem(second)]);

    // Dragging two same-named folders from different places yields two
    // structures with the same name, so both upload to the same prefix and the
    // second overwrites the first. Nothing here merges or disambiguates them.
    expect(result.folderStructures.map((f) => f.name)).toEqual(['photos', 'photos']);
  });
});

describe('failures during extraction', () => {
  it('skips a file it cannot read and keeps the rest', async () => {
    const good = makeFile('good.txt');
    const dir = mockDirectoryEntry('docs', [
      mockFileEntry(makeFile('locked.txt'), { failWith: new Error('NotReadableError') }),
      mockFileEntry(good),
    ]);

    const result = await process([mockDataTransferItem(dir)]);

    // One unreadable file must not abandon the whole folder - but the loss is
    // now reported instead of vanishing into a bare catch.
    expect(pathsOf(result.folderStructures[0]!.files)).toEqual(['docs/good.txt']);
    expect(result.skipped).toEqual([
      {
        kind: 'file',
        path: 'docs/locked.txt',
        reason: expect.stringContaining('could not be read'),
      },
    ]);
  });

  it('skips a subdirectory it cannot read and keeps the rest', async () => {
    const broken = mockDirectoryEntry('broken', [], { failWith: new Error('SecurityError') });
    const dir = mockDirectoryEntry('docs', [mockFileEntry(makeFile('a.txt')), broken]);

    const result = await process([mockDataTransferItem(dir)]);

    expect(pathsOf(result.folderStructures[0]!.files)).toEqual(['docs/a.txt']);
    expect(result.skipped).toEqual([
      { kind: 'folder', path: 'docs/broken', reason: expect.stringContaining('could not be read') },
    ]);
  });

  it('drops a top-level folder whose read fails outright', async () => {
    const dir = mockDirectoryEntry('docs', [], { failWith: new Error('SecurityError') });

    const result = await process([mockDataTransferItem(dir)]);

    // Reported, not thrown: the rest of the drop still goes through.
    expect(result.folderStructures).toEqual([]);
    expect(result.skipped).toEqual([
      { kind: 'folder', path: 'docs', reason: expect.stringContaining('could not be read') },
    ]);
  });

  it('rejects the walk when the reader throws on a follow-up read', async () => {
    // The recursive readEntries() call sits inside the outer try, so a
    // synchronous throw there rejects the whole directory promise rather than
    // hanging it. Chrome throws InvalidStateError if a reader is driven
    // incorrectly, which is exactly this shape.
    let calls = 0;
    const dir = {
      isFile: false,
      isDirectory: true,
      name: 'docs',
      fullPath: '/docs',
      createReader: () => ({
        readEntries(onSuccess: (entries: unknown[]) => void) {
          calls++;
          if (calls > 1) throw new DOMException('InvalidStateError');
          queueMicrotask(() => onSuccess([mockFileEntry(makeFile('a.txt'))]));
        },
      }),
    };

    const result = await process([mockDataTransferItem(dir as unknown as FileSystemEntry)]);

    // Reported and dropped, not left pending - a hung promise here would stall
    // the entire drop behind Promise.all forever.
    expect(result.folderStructures).toEqual([]);
    expect(result.skipped).toEqual([
      { kind: 'folder', path: 'docs', reason: expect.stringContaining('could not be read') },
    ]);
  });

  it('rejects the walk when an entry is revoked mid-read', async () => {
    // Deleting the folder while the drop is being processed leaves entries
    // whose property access throws.
    const revoked = {
      get isFile(): boolean {
        throw new DOMException('NotFoundError');
      },
      name: 'ghost',
    };
    const dir = {
      isFile: false,
      isDirectory: true,
      name: 'docs',
      fullPath: '/docs',
      createReader: () => ({
        readEntries(onSuccess: (entries: unknown[]) => void) {
          queueMicrotask(() => onSuccess([revoked]));
        },
      }),
    };

    const result = await process([mockDataTransferItem(dir as unknown as FileSystemEntry)]);

    expect(result.folderStructures).toEqual([]);
    expect(result.skipped).toEqual([
      { kind: 'folder', path: 'docs', reason: expect.stringContaining('could not be read') },
    ]);
  });

  it('still uploads loose files when a folder fails', async () => {
    const loose = makeFile('loose.txt');
    const broken = mockDirectoryEntry('broken', [], { failWith: new Error('SecurityError') });

    const result = await process([
      mockDataTransferItem(mockFileEntry(loose), { file: loose }),
      mockDataTransferItem(broken),
    ]);

    expect(result.individualFiles).toEqual([loose]);
  });
});

describe('processFileList', () => {
  it('treats a flat selection as individual files', () => {
    const a = makeFile('a.txt');
    const b = makeFile('b.txt');

    const result = FolderStructureProcessor.processFileList([a, b]);

    expect(result.individualFiles).toEqual([a, b]);
    expect(result.folderStructures).toEqual([]);
  });

  it('groups files by their top-level folder', () => {
    const result = FolderStructureProcessor.processFileList([
      makeFileWithPath('a.txt', 'docs/a.txt', 10),
      makeFileWithPath('b.txt', 'docs/sub/b.txt', 20),
      makeFileWithPath('c.txt', 'photos/c.txt', 30),
    ]);

    expect(result.folderStructures.map((f) => f.name)).toEqual(['docs', 'photos']);
    expect(result.folderStructures[0]).toMatchObject({ totalSize: 30, relativePath: 'docs' });
    expect(result.folderStructures[1]).toMatchObject({ totalSize: 30 });
  });

  it('keeps nested files under their root folder, not their own', () => {
    const result = FolderStructureProcessor.processFileList([
      makeFileWithPath('deep.txt', 'root/a/b/deep.txt'),
    ]);

    // Grouping on the first path segment is what makes one upload per dropped
    // folder rather than one per nesting level.
    expect(result.folderStructures).toHaveLength(1);
    expect(result.folderStructures[0]!.name).toBe('root');
  });

  it('treats a relative path with no slash as a loose file', () => {
    const file = makeFileWithPath('a.txt', 'a.txt');

    const result = FolderStructureProcessor.processFileList([file]);

    expect(result.individualFiles).toEqual([file]);
    expect(result.folderStructures).toEqual([]);
  });

  it('skips the zero-byte entries browsers emit for directories', () => {
    const directoryMarker = new File([], 'subdir');
    const real = makeFile('a.txt');

    const result = FolderStructureProcessor.processFileList([directoryMarker, real]);

    // Uploading these would create phantom zero-byte objects shadowing real
    // folder prefixes.
    expect(result.individualFiles).toEqual([real]);
  });

  it('keeps a genuinely empty file that has an extension', () => {
    const empty = new File([], 'empty.txt', { type: 'text/plain' });

    const result = FolderStructureProcessor.processFileList([empty]);

    // Only extension-less, type-less, zero-byte entries look like directories.
    expect(result.individualFiles).toEqual([empty]);
  });

  it('accepts a FileList as well as an array', () => {
    const files = [makeFile('a.txt')];
    const fileList = files as unknown as FileList;

    expect(FolderStructureProcessor.processFileList(fileList).individualFiles).toEqual(files);
  });

  it('handles an empty selection', () => {
    expect(FolderStructureProcessor.processFileList([])).toEqual({
      individualFiles: [],
      folderStructures: [],
      skipped: [],
    });
  });
});
