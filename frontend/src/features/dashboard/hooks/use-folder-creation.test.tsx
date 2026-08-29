/**
 * Creating a folder writes the name the user typed.
 *
 * This is the behavioural half of the folder-name fix. `folder-name.test.ts`
 * pins which names are allowed; this pins that an allowed name reaches S3
 * unchanged, which is what actually went wrong: `Café ☕` passed validation,
 * was then rewritten to `Caf_ __`, and the folder appeared under a name nobody
 * had typed.
 *
 * It also covers the second defect that fell out of the same rewrite. The
 * duplicate check ran against the raw name while creation used the sanitized
 * one, so the two disagreed about which key they were talking about.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFolderCreation } from './use-folder-creation';

const { fetchData, refreshCurrentData, addFolder, undoAddFolder } = vi.hoisted(() => {
  const undoAddFolder = vi.fn();
  return {
    fetchData: vi.fn(async () => {}),
    refreshCurrentData: vi.fn(async () => {}),
    addFolder: vi.fn(() => undoAddFolder),
    undoAddFolder,
  };
});

vi.mock('@opndrive/s3-api', () => ({ BYOS3ApiProvider: class {} }));

vi.mock('@/context/data-context', () => {
  const state = { fetchData, refreshCurrentData, addFolder };
  // Applies the selector the way zustand does. Returning the whole state
  // regardless worked only while callers destructured it, and silently handed
  // back the entire store to anyone selecting a single value out of it.
  const useDriveStore = Object.assign(
    (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state }
  );
  return { useDriveStore };
});

type Listing = { files: { Key: string }[]; folders: { Prefix: string }[] };

const apiS3 = {
  createFolder: vi.fn(async (_key: string) => {}),
  // Nothing under the prefix, so no duplicate prompt unless a test says so.
  fetchDirectoryStructure: vi.fn(async (_prefix: string, _max: number): Promise<Listing> => ({
    files: [],
    folders: [],
  })),
};

vi.mock('@/hooks/use-auth-guard', () => ({
  useAuthGuard: () => ({ apiS3 }),
}));

/** Prefixes the existence check was asked about. */
const checkedPrefixes = () => apiS3.fetchDirectoryStructure.mock.calls.map((call) => call[0]);

function mount(currentPath = '') {
  return renderHook(() => useFolderCreation({ currentPath }));
}

beforeEach(() => {
  vi.clearAllMocks();
  apiS3.fetchDirectoryStructure.mockResolvedValue({ files: [], folders: [] });
});

describe('the folder is created under the name that was typed', () => {
  it.each([
    ['accents and an emoji', 'Café ☕'],
    ['CJK', '文档'],
    ['cyrillic', 'Документы'],
    ['punctuation', 'Q3 report (final) v2.1'],
  ])('preserves %s', async (_label, name) => {
    const { result } = mount();

    await act(async () => {
      await result.current.handleFolderCreation(name);
    });

    // Not `Caf_ __/`, which is what the old sanitizer produced.
    expect(apiS3.createFolder).toHaveBeenCalledWith(`${name}/`);
  });

  it('nests under the current path', async () => {
    const { result } = mount('projects/2026/');

    await act(async () => {
      await result.current.handleFolderCreation('Café ☕');
    });

    expect(apiS3.createFolder).toHaveBeenCalledWith('projects/2026/Café ☕/');
  });

  it('reports the created name back unchanged', async () => {
    const onFolderCreated = vi.fn();
    const { result } = renderHook(() => useFolderCreation({ currentPath: '', onFolderCreated }));

    await act(async () => {
      await result.current.handleFolderCreation('Café ☕');
    });

    expect(onFolderCreated).toHaveBeenCalledWith('Café ☕');
  });
});

describe('the duplicate check and the write agree on the key', () => {
  it('checks the same name it goes on to create', async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.handleFolderCreation('Café ☕');
    });

    // These used to differ: the check asked about `Café ☕/` while creation
    // wrote `Caf_ __/`, so an existing folder under the written name was never
    // detected and got silently overwritten.
    expect(checkedPrefixes()).toContain('Café ☕/');
    expect(apiS3.createFolder).toHaveBeenCalledWith('Café ☕/');
  });

  it('prompts instead of overwriting when the name is taken', async () => {
    apiS3.fetchDirectoryStructure.mockResolvedValue({
      files: [{ Key: 'Café ☕/a.txt' }],
      folders: [],
    });

    const { result } = mount();

    // Deliberately not awaited: the promise only settles once the user answers
    // the prompt, and the prompt is what is being asserted on.
    await act(async () => {
      void result.current.handleFolderCreation('Café ☕');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.duplicateDialog.isOpen).toBe(true);
    expect(result.current.duplicateDialog.folderName).toBe('Café ☕');
    expect(apiS3.createFolder).not.toHaveBeenCalled();
  });

  it('trims once so every step uses the same name', async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.handleFolderCreation('  Reports  ');
    });

    expect(checkedPrefixes()).toContain('Reports/');
    expect(apiS3.createFolder).toHaveBeenCalledWith('Reports/');
  });
});

describe('a name that cannot work is refused, not rewritten', () => {
  it('rejects a slash with the reason', async () => {
    const { result } = mount();

    await expect(
      act(async () => {
        await result.current.handleFolderCreation('a/b');
      })
    ).rejects.toThrow('Folder name cannot contain a slash.');

    expect(apiS3.createFolder).not.toHaveBeenCalled();
  });

  it('rejects an empty name', async () => {
    const { result } = mount();

    await expect(
      act(async () => {
        await result.current.handleFolderCreation('   ');
      })
    ).rejects.toThrow('Folder name cannot be empty.');

    expect(apiS3.createFolder).not.toHaveBeenCalled();
  });
});

describe('the new folder appears without a re-list', () => {
  it('adds the row to the listing it was created in', async () => {
    const { result } = mount('projects/');

    await act(async () => {
      await result.current.handleFolderCreation('reports');
    });

    expect(addFolder).toHaveBeenCalledWith('projects/', 'reports');
    // This used to cost three full listings of the prefix for one folder: one
    // inside createFolder and a refreshCurrentData - itself two - after it.
    expect(fetchData).not.toHaveBeenCalled();
    expect(refreshCurrentData).not.toHaveBeenCalled();
  });

  it('adds it at the root when there is no current path', async () => {
    const { result } = mount('');

    await act(async () => {
      await result.current.handleFolderCreation('reports');
    });

    expect(addFolder).toHaveBeenCalledWith('', 'reports');
  });

  it('takes the row back out when the write is refused', async () => {
    apiS3.createFolder.mockRejectedValueOnce(new Error('AccessDenied'));
    const { result } = mount('projects/');

    await act(async () => {
      await expect(result.current.handleFolderCreation('reports')).rejects.toThrow('AccessDenied');
    });

    expect(undoAddFolder).toHaveBeenCalled();
  });
});
