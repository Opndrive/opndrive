/**
 * Rename service: the layer between the rename UI and `@opndrive/s3-api`.
 *
 * The api provider is injected, so it is faked here rather than mocked through
 * the module registry - same effect, less indirection. s3-api's own behaviour
 * is covered by its suite; what matters here is how this layer maps results and
 * failures onto the callbacks the UI renders.
 *
 * The interesting case is `copied-not-cleaned`: the rename SUCCEEDED and only
 * cleanup of the old copies fell short. Reporting that as an error would tell
 * the user their rename failed while their files sit correctly at the new name.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import { createRenameService } from './rename-service';
import type { FileItem } from '../types/file';
import type { Folder } from '../types/folder';

function fakeApi(overrides: Record<string, unknown> = {}) {
  return {
    moveFile: vi.fn(async () => {}),
    renameFolder: vi.fn(async () => ({
      status: 'completed',
      totalKeys: 3,
      copiedKeys: 3,
      deletedKeys: 3,
      errors: [],
      completed: true,
    })),
    fetchMetadata: vi.fn(async () => null),
    fetchDirectoryStructure: vi.fn(async () => ({ files: [], folders: [] })),
    ...overrides,
  } as unknown as BYOS3ApiProvider;
}

const file = { Key: 'docs/draft.md', name: 'draft.md' } as FileItem;
const folder = { name: 'photos', Prefix: 'docs/photos/' } as Folder;

/** Collects every callback the service can fire. */
function handlers() {
  return {
    onProgress: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    onPartialCleanup: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('renameFile', () => {
  it('moves the object to the new name in the same folder', async () => {
    const api = fakeApi();

    await createRenameService(api).renameFile(file, 'final.md', 'docs');

    expect(api.moveFile).toHaveBeenCalledExactlyOnceWith({
      oldKey: 'docs/draft.md',
      newKey: 'docs/final.md',
    });
  });

  it('renames using the object key, not a reconstructed path', async () => {
    const api = fakeApi();
    const nested = { Key: 'a/b/c/report.pdf', name: 'report.pdf' } as FileItem;

    await createRenameService(api).renameFile(nested, 'summary.pdf', 'ignored/path');

    // The key is authoritative; rebuilding it from currentPath would break for
    // anything the UI navigated to indirectly.
    expect(api.moveFile).toHaveBeenCalledWith({
      oldKey: 'a/b/c/report.pdf',
      newKey: 'a/b/c/summary.pdf',
    });
  });

  it('reports progress then completion', async () => {
    const h = handlers();

    await createRenameService(fakeApi()).renameFile(file, 'final.md', 'docs', h);

    expect(h.onProgress.mock.calls.map(([p]) => p.status)).toEqual(['renaming', 'success']);
    expect(h.onComplete).toHaveBeenCalledOnce();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('rejects a file with no key', async () => {
    const h = handlers();
    const keyless = { name: 'ghost.md' } as FileItem;

    await expect(
      createRenameService(fakeApi()).renameFile(keyless, 'x.md', 'docs', h)
    ).rejects.toThrow('File key is missing');

    expect(h.onError).toHaveBeenCalledExactlyOnceWith('File key is missing');
  });

  it('surfaces a move failure through every error channel', async () => {
    const api = fakeApi({
      moveFile: vi.fn(async () => {
        throw new Error('AccessDenied');
      }),
    });
    const h = handlers();

    await expect(createRenameService(api).renameFile(file, 'final.md', 'docs', h)).rejects.toThrow(
      'AccessDenied'
    );

    expect(h.onProgress).toHaveBeenLastCalledWith({ status: 'error', error: 'AccessDenied' });
    expect(h.onError).toHaveBeenCalledExactlyOnceWith('AccessDenied');
    expect(h.onComplete).not.toHaveBeenCalled();
  });

  it('describes a non-Error rejection', async () => {
    const api = fakeApi({
      moveFile: vi.fn(async () => {
        throw 'just a string';
      }),
    });
    const h = handlers();

    await expect(
      createRenameService(api).renameFile(file, 'x.md', 'docs', h)
    ).rejects.toBeDefined();

    expect(h.onError).toHaveBeenCalledExactlyOnceWith('Failed to rename file');
  });

  it('works without any callbacks', async () => {
    await expect(
      createRenameService(fakeApi()).renameFile(file, 'final.md', 'docs')
    ).resolves.toBeUndefined();
  });

  it('never touches S3 when the new name equals the old one', async () => {
    const api = fakeApi();
    const h = handlers();

    await createRenameService(api).renameFile(file, 'draft.md', 'docs', h);

    // Without this guard the call becomes a copy of the object onto itself
    // followed by a delete of that same key. Real S3 refuses the self-copy so
    // the delete is never reached, but that safety belongs to the backend - an
    // S3-compatible service that permits the copy would delete the file.
    expect(api.moveFile).not.toHaveBeenCalled();
  });

  it('reports a same-name rename as a clean success', async () => {
    const h = handlers();

    await expect(
      createRenameService(fakeApi()).renameFile(file, 'draft.md', 'docs', h)
    ).resolves.toBeUndefined();

    // The user asked for the name it already has, so nothing is wrong - the UI
    // should close the dialog, not show an error.
    expect(h.onProgress.mock.calls.map(([p]) => p.status)).toEqual(['renaming', 'success']);
    expect(h.onComplete).toHaveBeenCalledOnce();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('still renames when only the casing differs', async () => {
    const api = fakeApi();

    await createRenameService(api).renameFile(file, 'Draft.md', 'docs');

    // S3 keys are case-sensitive, so this is a real rename, not a no-op.
    expect(api.moveFile).toHaveBeenCalledExactlyOnceWith({
      oldKey: 'docs/draft.md',
      newKey: 'docs/Draft.md',
    });
  });
});

describe('renameFolder', () => {
  it('renames from the folder prefix to the new one', async () => {
    const api = fakeApi();

    await createRenameService(api).renameFolder(folder, 'pictures', 'docs/');

    expect(api.renameFolder).toHaveBeenCalledExactlyOnceWith({
      oldPrefix: 'docs/photos/',
      newPrefix: 'docs/pictures/',
    });
  });

  it('strips a leading slash from the current path', async () => {
    const api = fakeApi();

    await createRenameService(api).renameFolder(folder, 'pictures', '/docs/');

    // S3 keys never begin with '/'; leaving it on creates an unreachable prefix.
    expect(api.renameFolder).toHaveBeenCalledWith(
      expect.objectContaining({ newPrefix: 'docs/pictures/' })
    );
  });

  it('renames at the bucket root', async () => {
    const api = fakeApi();
    const rootFolder = { name: 'photos', Prefix: 'photos/' } as Folder;

    await createRenameService(api).renameFolder(rootFolder, 'pictures', '');

    expect(api.renameFolder).toHaveBeenCalledWith({
      oldPrefix: 'photos/',
      newPrefix: 'pictures/',
    });
  });

  it('reports success when the rename completes', async () => {
    const h = handlers();

    await createRenameService(fakeApi()).renameFolder(folder, 'pictures', 'docs/', h);

    expect(h.onProgress.mock.calls.map(([p]) => p.status)).toEqual(['renaming', 'success']);
    expect(h.onComplete).toHaveBeenCalledOnce();
    expect(h.onPartialCleanup).not.toHaveBeenCalled();
  });

  it('treats a partial cleanup as SUCCESS, not failure', async () => {
    const api = fakeApi({
      renameFolder: vi.fn(async () => ({
        status: 'copied-not-cleaned',
        totalKeys: 5,
        copiedKeys: 5,
        deletedKeys: 3,
        errors: [{ key: 'docs/photos/a.jpg', code: 'AccessDenied', message: 'Access Denied' }],
        completed: false,
      })),
    });
    const h = handlers();

    await expect(
      createRenameService(api).renameFolder(folder, 'pictures', 'docs/', h)
    ).resolves.toBeUndefined();

    // The data is complete and correct at the new name. Calling this a failed
    // rename would be actively false.
    expect(h.onProgress).toHaveBeenLastCalledWith({ status: 'success' });
    expect(h.onError).not.toHaveBeenCalled();
    expect(h.onPartialCleanup).toHaveBeenCalledOnce();
  });

  it('names the leftover files in the partial-cleanup message', async () => {
    const api = fakeApi({
      renameFolder: vi.fn(async () => ({
        status: 'copied-not-cleaned',
        totalKeys: 5,
        copiedKeys: 5,
        deletedKeys: 4,
        errors: [{ key: 'docs/photos/a.jpg', code: 'AccessDenied', message: 'Access Denied' }],
        completed: false,
      })),
    });
    const h = handlers();

    await createRenameService(api).renameFolder(folder, 'pictures', 'docs/', h);

    const message = h.onPartialCleanup.mock.calls[0]![0] as string;
    expect(message).toContain('pictures');
    expect(message).toContain('5');
    expect(message).toContain('docs/photos/a.jpg');
  });

  it('throws when the copy phase failed', async () => {
    const api = fakeApi({
      renameFolder: vi.fn(async () => ({
        status: 'failed',
        totalKeys: 5,
        copiedKeys: 2,
        deletedKeys: 0,
        errors: [{ key: 'docs/photos/b.jpg', code: 'AccessDenied', message: 'Access Denied' }],
        completed: false,
      })),
    });
    const h = handlers();

    await expect(
      createRenameService(api).renameFolder(folder, 'pictures', 'docs/', h)
    ).rejects.toThrow(/nothing was changed/);

    expect(h.onError).toHaveBeenCalledOnce();
    expect(h.onComplete).not.toHaveBeenCalled();
  });

  it('tells the user retrying is safe and mentions the orphaned copies', async () => {
    const api = fakeApi({
      renameFolder: vi.fn(async () => ({
        status: 'failed',
        totalKeys: 5,
        copiedKeys: 2,
        deletedKeys: 0,
        errors: [{ key: 'docs/photos/b.jpg', message: 'Access Denied' }],
        completed: false,
      })),
    });
    const h = handlers();

    await expect(
      createRenameService(api).renameFolder(folder, 'pictures', 'docs/', h)
    ).rejects.toThrow();

    const message = h.onError.mock.calls[0]![0] as string;
    // The source is untouched, so the honest advice is "try again".
    expect(message).toMatch(/original folder is intact/);
    expect(message).toContain('2 partial copy');
  });

  it('still explains the leftovers when the delete failed without an error code', async () => {
    const api = fakeApi({
      renameFolder: vi.fn(async () => ({
        status: 'copied-not-cleaned',
        totalKeys: 3,
        copiedKeys: 3,
        deletedKeys: 2,
        // A dropped connection surfaces with no S3 error code at all.
        errors: [{ key: 'docs/photos/c.jpg', message: 'socket hang up' }],
        completed: false,
      })),
    });
    const h = handlers();

    await createRenameService(api).renameFolder(folder, 'pictures', 'docs/', h);

    const message = h.onPartialCleanup.mock.calls[0]![0] as string;
    // The wording must not depend on the failure being a permissions error -
    // the user needs to know their files copied and the old ones remain.
    expect(message).toMatch(/safely at the\s+new location/);
    expect(message).toMatch(/could not be removed/);
    expect(message).toContain('socket hang up');
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('surfaces a thrown api failure', async () => {
    const api = fakeApi({
      renameFolder: vi.fn(async () => {
        throw new Error('overlapping prefixes');
      }),
    });
    const h = handlers();

    await expect(
      createRenameService(api).renameFolder(folder, 'pictures', 'docs/', h)
    ).rejects.toThrow('overlapping prefixes');

    expect(h.onError).toHaveBeenCalledExactlyOnceWith('overlapping prefixes');
  });

  describe('legacy s3-api result shape', () => {
    it('reads a fully processed legacy result as success', async () => {
      const api = fakeApi({
        renameFolder: vi.fn(async () => ({ total: 4, processed: 4 })),
      });
      const h = handlers();

      await createRenameService(api).renameFolder(folder, 'pictures', 'docs/', h);

      expect(h.onComplete).toHaveBeenCalledOnce();
    });

    it('reads a partially processed legacy result as failure', async () => {
      const api = fakeApi({
        renameFolder: vi.fn(async () => ({ total: 4, processed: 2 })),
      });

      await expect(
        createRenameService(api).renameFolder(folder, 'pictures', 'docs/')
      ).rejects.toThrow();
    });

    it('warns once about the outdated package, not per rename', async () => {
      const api = fakeApi({
        renameFolder: vi.fn(async () => ({ total: 1, processed: 1 })),
      });
      const service = createRenameService(api);

      await service.renameFolder(folder, 'a', 'docs/');
      await service.renameFolder(folder, 'b', 'docs/');

      // Warning per rename would drown the console during bulk operations.
      const warnings = vi
        .mocked(console.warn)
        .mock.calls.filter(([m]) => String(m).includes('predates 2.7.0'));
      expect(warnings.length).toBeLessThanOrEqual(1);
    });
  });
});

describe('unique name generation', () => {
  it('appends a counter before the extension', () => {
    const service = createRenameService(fakeApi());

    expect(service.generateUniqueFileName('report.pdf', 1)).toBe('report (1).pdf');
    expect(service.generateUniqueFileName('report.pdf', 7)).toBe('report (7).pdf');
  });

  it('does not stack counters on an already numbered name', () => {
    const service = createRenameService(fakeApi());

    // Without this, retrying produces "report (1) (2).pdf".
    expect(service.generateUniqueFileName('report (1).pdf', 2)).toBe('report (2).pdf');
  });

  it('handles a name with no extension', () => {
    const service = createRenameService(fakeApi());

    expect(service.generateUniqueFileName('README', 1)).toBe('README (1)');
  });

  it('treats a leading dot as part of the name, not an extension', () => {
    const service = createRenameService(fakeApi());

    expect(service.generateUniqueFileName('.gitignore', 1)).toBe('.gitignore (1)');
  });

  it('appends a counter to a folder name', () => {
    const service = createRenameService(fakeApi());

    expect(service.generateUniqueFolderName('photos', 1)).toBe('photos (1)');
  });
});

describe('existence checks', () => {
  it('reports a file as existing when metadata comes back', async () => {
    const api = fakeApi({ fetchMetadata: vi.fn(async () => ({ ContentLength: 10 })) });

    await expect(createRenameService(api).checkFileExists('a.md', 'docs')).resolves.toBe(true);
  });

  it('reports a file as missing when metadata is null', async () => {
    const api = fakeApi({ fetchMetadata: vi.fn(async () => null) });

    await expect(createRenameService(api).checkFileExists('a.md', 'docs')).resolves.toBe(false);
  });

  it('reports a folder as existing when the prefix holds anything', async () => {
    const api = fakeApi({
      fetchDirectoryStructure: vi.fn(async () => ({
        files: [{ Key: 'docs/photos/a' }],
        folders: [],
      })),
    });

    await expect(createRenameService(api).checkFolderExists('photos', 'docs')).resolves.toBe(true);
  });

  it('reports an empty prefix as no folder', async () => {
    const api = fakeApi();

    await expect(createRenameService(api).checkFolderExists('photos', 'docs')).resolves.toBe(false);
  });
});

describe('findUniqueFileName', () => {
  it('starts numbering at (1) rather than offering the bare name', async () => {
    const api = fakeApi({ fetchMetadata: vi.fn(async () => null) });

    // This is the "Keep both" path, so the caller already knows the original is
    // taken. Returning it unchanged would overwrite the file the user chose to
    // keep.
    await expect(createRenameService(api).findUniqueFileName('report.pdf', 'docs')).resolves.toBe(
      'report (1).pdf'
    );
  });

  it('walks the counter past every taken name', async () => {
    const taken = new Set(['docs/report (1).pdf', 'docs/report (2).pdf']);
    const api = fakeApi({
      fetchMetadata: vi.fn(async (key: string) => (taken.has(key) ? { ContentLength: 1 } : null)),
    });

    await expect(createRenameService(api).findUniqueFileName('report.pdf', 'docs')).resolves.toBe(
      'report (3).pdf'
    );
  });

  it('falls back to a timestamp once 100 numbers are taken', async () => {
    const api = fakeApi({ fetchMetadata: vi.fn(async () => ({ ContentLength: 1 })) });

    const name = await createRenameService(api).findUniqueFileName('report.pdf', 'docs');

    // Better a long name than an unbounded loop or an overwrite.
    expect(name).toMatch(/^report \(\d{13}\)\.pdf$/);
  });

  it('numbers folders from (1) too', async () => {
    const api = fakeApi();

    await expect(createRenameService(api).findUniqueFolderName('photos', 'docs')).resolves.toBe(
      'photos (1)'
    );
  });

  it('falls back to a timestamp for folders as well', async () => {
    const api = fakeApi({
      fetchDirectoryStructure: vi.fn(async () => ({ files: [{ Key: 'x' }], folders: [] })),
    });

    const name = await createRenameService(api).findUniqueFolderName('photos', 'docs');

    expect(name).toMatch(/^photos \(\d{13}\)$/);
  });
});
