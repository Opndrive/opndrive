/**
 * Folder existence check.
 *
 * Tiny, but it is the shared answer to "is this name already taken?" behind
 * folder creation, rename, and upload. It deliberately does NOT catch: four
 * call sites used to swallow the error and return false, so a permissions or
 * network blip read as "nothing here" and the app created, renamed, or uploaded
 * over data that already existed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import { folderExists, describeFolderCheckError } from './folder-existence';

function fakeApi(fetchDirectoryStructure = vi.fn(async () => ({ files: [], folders: [] }))) {
  return {
    fetchDirectoryStructure,
  } as unknown as BYOS3ApiProvider & { fetchDirectoryStructure: typeof fetchDirectoryStructure };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('folderExists', () => {
  it('asks for a single key, since existence needs no more', async () => {
    const api = fakeApi();

    await folderExists(api, 'docs/photos/');

    // Listing the whole folder to answer a yes/no question would be wasteful
    // on a folder with thousands of objects.
    expect(api.fetchDirectoryStructure).toHaveBeenCalledExactlyOnceWith('docs/photos/', 1);
  });

  it('reports true when a file sits under the prefix', async () => {
    const api = fakeApi(
      vi.fn(async () => ({ files: [{ Key: 'docs/photos/a.jpg' }], folders: [] }))
    );

    await expect(folderExists(api, 'docs/photos/')).resolves.toBe(true);
  });

  it('reports true when a subfolder sits under the prefix', async () => {
    const api = fakeApi(
      vi.fn(async () => ({ files: [], folders: [{ Prefix: 'docs/photos/raw/' }] }))
    );

    await expect(folderExists(api, 'docs/photos/')).resolves.toBe(true);
  });

  it('reports false for a prefix holding nothing', async () => {
    await expect(folderExists(fakeApi(), 'docs/new/')).resolves.toBe(false);
  });

  it('propagates a listing failure instead of answering false', async () => {
    const api = fakeApi(
      vi.fn(async () => {
        throw new Error('AccessDenied');
      })
    );

    // Answering "false" here is what let the app overwrite existing folders.
    await expect(folderExists(api, 'docs/photos/')).rejects.toThrow('AccessDenied');
  });
});

describe('describeFolderCheckError', () => {
  it('names the action that was cancelled', () => {
    expect(describeFolderCheckError('creating the folder')).toContain('creating the folder');
  });

  it('says the check failed, not that the name is taken', () => {
    const message = describeFolderCheckError('the upload');

    // We genuinely do not know the state of the bucket; claiming the folder
    // already exists would be a guess presented as fact.
    expect(message).toMatch(/[Cc]ould not check/);
    expect(message).not.toMatch(/already exists/);
  });

  it('tells the user it is worth retrying', () => {
    expect(describeFolderCheckError('the rename')).toMatch(/try again/i);
  });
});
