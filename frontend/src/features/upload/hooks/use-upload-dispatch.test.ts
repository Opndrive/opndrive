/**
 * useUploadDispatch.
 *
 * The seam that replaces `handleFilesDroppedToDirectory`, so these tests are
 * mostly about the three things the old path got wrong:
 *
 *  - two folders of the same name in one drop both passed the bucket check and
 *    the second overwrote the first,
 *  - the loop returned on the first duplicate and abandoned everything behind
 *    it,
 *  - and nothing downstream ever learned what extraction had failed to read.
 *
 * `folderExists` is mocked because it is the only network edge; the queue store
 * and the executor contract are exercised for real.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import { useUploadDispatch } from './use-upload-dispatch';
import { useUploadQueueStore } from '../stores/use-upload-queue-store';
import { useUploadStore } from '../stores/use-upload-store';
import type { ProcessedDragData, FolderStructure } from '../types/folder-upload-types';
import { folderExists } from '@/services/folder-existence';
import { objectExists } from '@/services/object-existence';
import { generateUniqueFileName } from '../utils/unique-filename';
import { createUploadExecutor, type UploadExecutor } from '../services/upload-executor';

vi.mock('@/services/folder-existence', () => ({
  folderExists: vi.fn(),
  describeFolderCheckError: vi.fn(),
}));

vi.mock('@/services/object-existence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/object-existence')>()),
  objectExists: vi.fn(),
}));

vi.mock('../utils/unique-filename', () => ({
  generateUniqueFileName: vi.fn(),
  generateUniqueFolderName: vi.fn(),
}));

/** The executor is injected through context, which is mocked to a test double. */
let currentExecutor: UploadExecutor | null = null;
vi.mock('../context/upload-context', () => ({
  useUploadExecutor: () => currentExecutor,
}));

const mockFolderExists = vi.mocked(folderExists);
const mockObjectExists = vi.mocked(objectExists);
const mockUniqueName = vi.mocked(generateUniqueFileName);
const queue = () => useUploadQueueStore.getState();
const uploads = () => useUploadStore.getState().uploads;

const apiS3 = { __brand: 'fake' } as unknown as BYOS3ApiProvider;

function fakeManager() {
  const added: { id: string; key: string }[] = [];
  let n = 0;
  return {
    added,
    addUpload(_file: File, config: { key: string }) {
      const id = `upload-${n++}`;
      added.push({ id, key: config.key });
      return id;
    },
    cancelUpload: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

function makeFile(name: string, relativePath?: string, size = 10): File {
  const file = new File([new Uint8Array(size)], name);
  if (relativePath) Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
}

function folder(name: string, fileNames: string[] = ['a.jpg']): FolderStructure {
  const files = fileNames.map((f) => makeFile(f, `${name}/${f}`));
  return { name, files, totalSize: files.length * 10, relativePath: name };
}

function drop(extras: Partial<ProcessedDragData> = {}): ProcessedDragData {
  return { individualFiles: [], folderStructures: [], skipped: [], ...extras };
}

let manager: ReturnType<typeof fakeManager>;

beforeEach(() => {
  manager = fakeManager();
  currentExecutor = createUploadExecutor(manager);
  mockFolderExists.mockReset();
  mockFolderExists.mockResolvedValue(false);
  mockObjectExists.mockReset();
  mockObjectExists.mockResolvedValue(false);
  mockUniqueName.mockReset();
  useUploadStore.setState({ uploads: {}, duplicateQueue: [] });
});

function dispatch() {
  return renderHook(() => useUploadDispatch()).result.current;
}

describe('folders', () => {
  it('uploads a folder under the prefix planning chose', async () => {
    const dispatchDrop = dispatch();

    await dispatchDrop(drop({ folderStructures: [folder('photos')] }), 'docs', apiS3);

    expect(manager.added.map((a) => a.key)).toEqual(['docs/photos/a.jpg']);
  });

  it('separates two folders of the same name in one drop', async () => {
    // The original bug: both were checked against the bucket, neither was
    // stored yet, so both passed and the second overwrote the first.
    const dispatchDrop = dispatch();

    await dispatchDrop(drop({ folderStructures: [folder('photos'), folder('photos')] }), '', apiS3);

    expect(manager.added.map((a) => a.key)).toEqual(['photos/a.jpg', 'photos (1)/a.jpg']);
  });

  it('does not re-nest a renamed folder under its original name', async () => {
    // The executor strips the dropped root; without that the key would be
    // "photos (1)/photos/a.jpg" and the rename would be undone one level down.
    mockFolderExists.mockImplementation(async (_api, prefix: string) => prefix === 'photos/');
    const dispatchDrop = dispatch();

    await dispatchDrop(drop({ folderStructures: [folder('photos')] }), '', apiS3);

    expect(manager.added[0]!.key).toBe('photos (1)/a.jpg');
  });

  it('registers a folder card the panel can cancel', async () => {
    const dispatchDrop = dispatch();

    const { dispatched } = await dispatchDrop(
      drop({ folderStructures: [folder('photos', ['a.jpg', 'b.jpg'])] }),
      '',
      apiS3
    );

    const taskId = dispatched[0]!.taskId;
    // The card id IS the executor's task id, which is what cancelTask takes.
    expect(uploads()[taskId]).toMatchObject({ name: 'photos', type: 'folder' });
    expect(uploads()[taskId]!.fileIds).toEqual(['upload-0', 'upload-1']);
    expect(currentExecutor!.uploadsFor(taskId)).toEqual(['upload-0', 'upload-1']);
  });

  it('names file cards by key so duplicates stay distinguishable', async () => {
    // Two "img.jpg" from different subfolders would otherwise render as two
    // identical rows.
    const structure = folder('photos');
    structure.files = [
      makeFile('img.jpg', 'photos/raw/img.jpg'),
      makeFile('img.jpg', 'photos/edited/img.jpg'),
    ];
    const dispatchDrop = dispatch();

    await dispatchDrop(drop({ folderStructures: [structure] }), '', apiS3);

    expect(uploads()['upload-0']!.name).toBe('photos/raw/img.jpg');
    expect(uploads()['upload-1']!.name).toBe('photos/edited/img.jpg');
  });

  it('plans every folder even when one cannot be verified', async () => {
    // The old loop returned on the first duplicate and silently dropped the
    // rest of the drop.
    mockFolderExists.mockImplementation(async (_api, prefix: string) => {
      if (prefix === 'a/') throw new Error('network down');
      return false;
    });
    const dispatchDrop = dispatch();

    await dispatchDrop(
      drop({ folderStructures: [folder('a'), folder('b'), folder('c')] }),
      '',
      apiS3
    );

    expect(manager.added.map((a) => a.key)).toEqual(['a/a.jpg', 'b/a.jpg', 'c/a.jpg']);
  });
});

describe('loose files', () => {
  it('uploads them straight to the destination with no wrapper card', async () => {
    const dispatchDrop = dispatch();

    const { dispatched } = await dispatchDrop(
      drop({ individualFiles: [makeFile('notes.txt')] }),
      'docs',
      apiS3
    );

    expect(manager.added.map((a) => a.key)).toEqual(['docs/notes.txt']);
    expect(uploads()['upload-0']).toMatchObject({ name: 'notes.txt', type: 'file' });
    expect(uploads()['upload-0']!.parentFolderId).toBeUndefined();
    expect(uploads()[dispatched[0]!.taskId]).toBeUndefined();
  });

  it('handles files and folders in one drop', async () => {
    const dispatchDrop = dispatch();

    await dispatchDrop(
      drop({ individualFiles: [makeFile('notes.txt')], folderStructures: [folder('photos')] }),
      '',
      apiS3
    );

    expect(manager.added.map((a) => a.key)).toEqual(['notes.txt', 'photos/a.jpg']);
  });
});

describe('loose file collisions', () => {
  /** Waits for the dispatch to raise a prompt and hands it back. */
  async function nextPrompt() {
    for (let i = 0; i < 50; i++) {
      const prompt = useUploadStore.getState().duplicateQueue[0];
      if (prompt) return prompt;
      await Promise.resolve();
    }
    throw new Error('no duplicate prompt was raised');
  }

  /** Answers whatever prompt the dispatch raises, once one appears. */
  async function answer(choice: 'replace' | 'keepBoth' | 'cancel', applyToAll = false) {
    const prompt = await nextPrompt();
    if (choice === 'replace') prompt.onReplace(applyToAll);
    else if (choice === 'keepBoth') prompt.onKeepBoth(applyToAll);
    else prompt.onCancel?.(applyToAll);
  }

  it('uploads without prompting when nothing is in the way', async () => {
    const dispatchDrop = dispatch();

    await dispatchDrop(drop({ individualFiles: [makeFile('notes.txt')] }), 'docs', apiS3);

    expect(useUploadStore.getState().duplicateQueue).toEqual([]);
    expect(manager.added.map((a) => a.key)).toEqual(['docs/notes.txt']);
  });

  it('asks before overwriting an object that already exists', async () => {
    // S3 PUT overwrites silently, so without this the user loses the old file
    // with no warning. This prompt existed before the executor pipeline and
    // was bypassed by it.
    mockObjectExists.mockResolvedValue(true);
    const dispatchDrop = dispatch();

    const pending = dispatchDrop(drop({ individualFiles: [makeFile('notes.txt')] }), '', apiS3);
    await answer('replace');
    await pending;

    expect(mockObjectExists).toHaveBeenCalledWith(apiS3, 'notes.txt');
    expect(manager.added.map((a) => a.key)).toEqual(['notes.txt']);
  });

  it('uploads under a fresh name when the user keeps both', async () => {
    mockObjectExists.mockResolvedValue(true);
    mockUniqueName.mockResolvedValue('notes (1).txt');
    const dispatchDrop = dispatch();

    const pending = dispatchDrop(drop({ individualFiles: [makeFile('notes.txt')] }), '', apiS3);
    await answer('keepBoth');
    await pending;

    expect(manager.added.map((a) => a.key)).toEqual(['notes (1).txt']);
  });

  it('does not upload at all when no free name can be found', async () => {
    // Keeping both is impossible, and replacing was not what the user asked
    // for, so the only safe outcome is to leave the object alone.
    mockObjectExists.mockResolvedValue(true);
    mockUniqueName.mockRejectedValue(new Error('exhausted'));
    const dispatchDrop = dispatch();

    const pending = dispatchDrop(drop({ individualFiles: [makeFile('notes.txt')] }), '', apiS3);
    await answer('keepBoth');
    const { notices } = await pending;

    expect(manager.added).toEqual([]);
    expect(notices.map((n) => n.kind)).toEqual(['skipped']);
  });

  it('uploads but warns when the check itself fails', async () => {
    // Indeterminate is not "free". The old code caught this and returned
    // false, so a throttled HEAD silently overwrote a real object.
    mockObjectExists.mockRejectedValue(new Error('throttled'));
    const dispatchDrop = dispatch();

    const { notices } = await dispatchDrop(
      drop({ individualFiles: [makeFile('notes.txt')] }),
      '',
      apiS3
    );

    expect(manager.added.map((a) => a.key)).toEqual(['notes.txt']);
    expect(notices.map((n) => n.kind)).toEqual(['unverified']);
    expect(useUploadStore.getState().duplicateQueue).toEqual([]);
  });

  it('does not object-check files inside a folder', async () => {
    // Those collide at the prefix level, which planning already resolved.
    const dispatchDrop = dispatch();

    await dispatchDrop(drop({ folderStructures: [folder('photos')] }), '', apiS3);

    expect(mockObjectExists).not.toHaveBeenCalled();
  });

  it('skips the check entirely with no api', async () => {
    const dispatchDrop = dispatch();

    await dispatchDrop(drop({ individualFiles: [makeFile('notes.txt')] }), '', null);

    expect(mockObjectExists).not.toHaveBeenCalled();
    expect(manager.added.map((a) => a.key)).toEqual(['notes.txt']);
  });

  it('checks several files at once rather than one after another', async () => {
    let inFlight = 0;
    let peak = 0;
    mockObjectExists.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return false;
    });
    const dispatchDrop = dispatch();

    await dispatchDrop(
      drop({ individualFiles: Array.from({ length: 8 }, (_, i) => makeFile(`f${i}.txt`)) }),
      '',
      apiS3
    );

    expect(peak).toBeGreaterThan(1);
    expect(mockObjectExists).toHaveBeenCalledTimes(8);
  });

  it('asks once when the answer is meant for the rest of the drop', async () => {
    mockObjectExists.mockResolvedValue(true);
    mockUniqueName.mockImplementation(async (_api, name: string) => `copy-${name}`);
    const dispatchDrop = dispatch();

    const pending = dispatchDrop(
      drop({ individualFiles: [makeFile('a.txt'), makeFile('b.txt'), makeFile('c.txt')] }),
      '',
      apiS3
    );

    // One answer for three colliding files. This used to be three identical
    // questions and three clicks, with no way to say the same thing once.
    await answer('keepBoth', true);
    await pending;

    expect(manager.added.map((a) => a.key)).toEqual(['copy-a.txt', 'copy-b.txt', 'copy-c.txt']);
    expect(useUploadStore.getState().duplicateQueue).toEqual([]);
  });

  it('counts down how many collisions are left', async () => {
    mockObjectExists.mockResolvedValue(true);
    mockUniqueName.mockImplementation(async (_api, name: string) => `copy-${name}`);
    const dispatchDrop = dispatch();

    const pending = dispatchDrop(
      drop({ individualFiles: [makeFile('a.txt'), makeFile('b.txt')] }),
      '',
      apiS3
    );

    // So the dialog can say how many are left rather than leaving the reader to
    // guess whether answering means one more click or nine.
    const first = await nextPrompt();
    expect(first.remaining).toBe(2);
    first.onKeepBoth(false);

    const second = await nextPrompt();
    expect(second.remaining).toBe(1);
    second.onKeepBoth(false);

    await pending;
  });

  it('carries on with the drop when one file is cancelled', async () => {
    mockObjectExists.mockResolvedValue(true);
    mockUniqueName.mockImplementation(async (_api, name: string) => `copy-${name}`);
    const dispatchDrop = dispatch();

    const pending = dispatchDrop(
      drop({ individualFiles: [makeFile('a.txt'), makeFile('b.txt')] }),
      '',
      apiS3
    );

    // Cancel used to close the dialog and resolve nothing, so this loop waited
    // for good: b.txt was never asked about and the whole drop stalled.
    await answer('cancel');
    await answer('keepBoth');
    await pending;

    expect(manager.added.map((a) => a.key)).toEqual(['copy-b.txt']);
  });

  it('abandons every remaining collision when cancel is meant for the rest', async () => {
    mockObjectExists.mockResolvedValue(true);
    const dispatchDrop = dispatch();

    const pending = dispatchDrop(
      drop({ individualFiles: [makeFile('a.txt'), makeFile('b.txt')] }),
      '',
      apiS3
    );

    await answer('cancel', true);
    await pending;

    expect(manager.added).toEqual([]);
  });

  it('asks one question at a time', async () => {
    // Five simultaneous modals would be unusable; the queue holds them.
    mockObjectExists.mockResolvedValue(true);
    mockUniqueName.mockImplementation(async (_api, name: string) => `copy-${name}`);
    const dispatchDrop = dispatch();

    const pending = dispatchDrop(
      drop({ individualFiles: [makeFile('a.txt'), makeFile('b.txt')] }),
      '',
      apiS3
    );

    await answer('keepBoth');
    expect(useUploadStore.getState().duplicateQueue.length).toBeLessThanOrEqual(1);
    await answer('keepBoth');
    await pending;

    expect(manager.added.map((a) => a.key)).toEqual(['copy-a.txt', 'copy-b.txt']);
  });
});

describe('notices', () => {
  it('returns what extraction skipped so the panel can show it', async () => {
    const dispatchDrop = dispatch();

    const { notices } = await dispatchDrop(
      drop({
        folderStructures: [folder('photos')],
        skipped: [{ path: 'photos/locked.raw', reason: 'could not be read', kind: 'file' }],
      }),
      '',
      apiS3
    );

    expect(notices).toHaveLength(1);
    expect(notices[0]!.kind).toBe('skipped');
    // And they are in the store, which is what QueueNotices renders from.
    expect(queue().notices).toHaveLength(1);
  });

  it('reports a rename', async () => {
    mockFolderExists.mockImplementation(async (_api, prefix: string) => prefix === 'photos/');
    const dispatchDrop = dispatch();

    const { notices } = await dispatchDrop(
      drop({ folderStructures: [folder('photos')] }),
      '',
      apiS3
    );

    expect(notices.map((n) => n.kind)).toEqual(['renamed']);
  });

  it('reports an unverified folder when the bucket check fails', async () => {
    mockFolderExists.mockRejectedValue(new Error('ERR_INTERNET_DISCONNECTED'));
    const dispatchDrop = dispatch();

    const { notices } = await dispatchDrop(
      drop({ folderStructures: [folder('photos')] }),
      '',
      apiS3
    );

    expect(notices.map((n) => n.kind)).toEqual(['unverified']);
    // The upload still happens, under the locally reserved name.
    expect(manager.added.map((a) => a.key)).toEqual(['photos/a.jpg']);
  });
});

describe('no session', () => {
  it('does nothing when there is no executor', async () => {
    currentExecutor = null;
    const dispatchDrop = dispatch();

    const outcome = await dispatchDrop(drop({ folderStructures: [folder('photos')] }), '', apiS3);

    expect(outcome.dispatched).toEqual([]);
    expect(outcome.nothingStarted).toBe(true);
    // Critically, planning did not run: reserving a prefix for an upload that
    // can never start would squat the name for the session.
    expect(queue().claims).toEqual([]);
    expect(mockFolderExists).not.toHaveBeenCalled();
  });
});

describe('a manager that refuses work', () => {
  it('surfaces the failure as a card instead of throwing', async () => {
    // addUpload throws on a disposed manager - logging out mid-drop.
    const dead = fakeManager();
    dead.addUpload = () => {
      throw new Error('This UploadManager instance has been disposed.');
    };
    currentExecutor = createUploadExecutor(dead);
    const dispatchDrop = dispatch();

    const { dispatched, nothingStarted } = await dispatchDrop(
      drop({ folderStructures: [folder('photos')] }),
      '',
      apiS3
    );

    expect(nothingStarted).toBe(true);
    const card = uploads()[dispatched[0]!.taskId];
    expect(card).toMatchObject({ status: 'failed', type: 'folder' });
    expect(card!.error).toContain('disposed');
    // And the prefix went back, since nothing was ever uploaded to it.
    expect(queue().claimedPrefixes()).toEqual([]);
  });
});

describe('planning without an api', () => {
  it('skips bucket checks entirely', async () => {
    const dispatchDrop = dispatch();

    await dispatchDrop(drop({ folderStructures: [folder('photos')] }), '', null);

    expect(mockFolderExists).not.toHaveBeenCalled();
    expect(manager.added.map((a) => a.key)).toEqual(['photos/a.jpg']);
  });
});

/**
 * What a card carries about where it is going.
 *
 * A finished upload adds its own row to the listing it landed in rather than
 * re-reading whatever prefix the user happens to be standing in. These three
 * fields are the only thing that makes that possible, and getting the prefix
 * wrong puts the row in the wrong folder - or in no folder at all.
 */
describe('destination on the card', () => {
  it('points a loose file at the prefix holding it', async () => {
    const dispatchDrop = dispatch();

    await dispatchDrop(drop({ individualFiles: [makeFile('notes.txt')] }), 'docs', apiS3);

    expect(uploads()['upload-0']).toMatchObject({
      key: 'docs/notes.txt',
      size: 10,
      destinationPrefix: 'docs/',
    });
  });

  it('points a loose file at the root with an empty prefix', async () => {
    const dispatchDrop = dispatch();

    await dispatchDrop(drop({ individualFiles: [makeFile('notes.txt')] }), '', apiS3);

    // toCacheKey turns '' into '/', which is how the root listing is keyed.
    expect(uploads()['upload-0']).toMatchObject({
      key: 'notes.txt',
      destinationPrefix: '',
    });
  });

  it('points a folder at the listing above it', async () => {
    const dispatchDrop = dispatch();

    const { dispatched } = await dispatchDrop(
      drop({ folderStructures: [folder('photos')] }),
      'docs',
      apiS3
    );

    // The plan's own prefix is 'docs/photos/' - it already ends with the
    // folder's name. The row for it goes one level up.
    expect(uploads()[dispatched[0]!.taskId]).toMatchObject({
      name: 'photos',
      destinationPrefix: 'docs/',
    });
  });

  it('points a folder dropped at the root at the root', async () => {
    const dispatchDrop = dispatch();

    const { dispatched } = await dispatchDrop(
      drop({ folderStructures: [folder('photos')] }),
      '',
      apiS3
    );

    expect(uploads()[dispatched[0]!.taskId]).toMatchObject({
      name: 'photos',
      destinationPrefix: '',
    });
  });

  it('names a renamed folder by the name it was actually stored under', async () => {
    mockFolderExists.mockImplementation(async (_api, prefix: string) => prefix === 'photos/');
    const dispatchDrop = dispatch();

    const { dispatched } = await dispatchDrop(
      drop({ folderStructures: [folder('photos')] }),
      '',
      apiS3
    );

    // Adding a row called "photos" for a folder stored as "photos (1)" would
    // put a folder in the listing that nobody can open.
    expect(uploads()[dispatched[0]!.taskId]).toMatchObject({
      name: 'photos (1)',
      destinationPrefix: '',
    });
  });

  it('gives a file inside a folder no destination of its own', async () => {
    const dispatchDrop = dispatch();

    await dispatchDrop(drop({ folderStructures: [folder('photos')] }), 'docs', apiS3);

    // These are never added one at a time: the folder card adds a single row
    // for all of them once the last one lands. A destination here would put a
    // loose file row into a folder listing that is about to be created.
    expect(uploads()['upload-0']).toMatchObject({ key: 'docs/photos/a.jpg', size: 10 });
    expect(uploads()['upload-0']!.destinationPrefix).toBeUndefined();
  });
});
