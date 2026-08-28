/**
 * What the multi-select delete asks before it does anything.
 *
 * This is the last thing standing between a selection and permanent deletion,
 * and it had two problems. It listed every name comma-joined and quoted, with
 * no cap - so eight files arrived as one run-on line to be parsed rather than
 * scanned, and four hundred arrived as a four-hundred-name paragraph.
 *
 * And it never mentioned folders. The single-folder dialog has always said "and
 * everything inside it"; this one said "5 items will be deleted forever", which
 * gives no hint that one of those five might hold ten thousand more.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMultiSelectActions } from './use-multi-select-actions';
import { confirmAction } from '@/shared/components/ui/confirm-dialog';
import type { FileItem } from '../types/file';
import type { Folder } from '../types/folder';

vi.mock('@/shared/components/ui/confirm-dialog', () => ({
  // Declined, so nothing past the question runs. These tests are about the
  // question.
  confirmAction: vi.fn(async () => false),
}));

vi.mock('./use-download', () => ({
  useDownloadActions: () => ({ downloadMultipleFiles: vi.fn() }),
}));

vi.mock('./use-delete-with-progress', () => ({
  useDeleteWithProgress: () => ({
    deleteFile: vi.fn(),
    deleteFolder: vi.fn(),
    batchDeleteFiles: vi.fn(),
  }),
}));

vi.mock('@/context/file-preview-context', () => ({
  useFilePreview: () => ({ openPreview: vi.fn() }),
}));

vi.mock('@/context/notification-context', () => ({
  // The hook reports what it could not delete through this. Nothing here
  // reaches that far - every test declines the question - but the provider is
  // read at render time, so it has to exist.
  useNotification: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

function file(name: string): FileItem {
  return {
    Key: `docs/${name}`,
    id: `docs/${name}`,
    name,
    extension: name.split('.').pop() ?? '',
    size: { value: 1, unit: 'B' },
  };
}

function folder(name: string): Folder {
  return {
    Prefix: `${name}/`,
    id: `${name}/`,
    name,
    icon: 'folder',
    location: { type: 'my-drive', label: 'My Drive' },
  };
}

function actions() {
  return renderHook(() => useMultiSelectActions({ openMultiShareDialog: vi.fn() })).result.current;
}

async function askAbout(items: (FileItem | Folder)[]) {
  const { handleDeleteItems } = actions();
  await act(async () => {
    await handleDeleteItems(items);
  });

  return vi.mocked(confirmAction).mock.calls[0]![0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the list of what will go', () => {
  it('puts one name on each line, unquoted', async () => {
    const asked = await askAbout([file('a.json'), file('b.json'), file('c.json')]);

    expect(asked.description).toContain('a.json\nb.json\nc.json');
    expect(asked.description).not.toContain('"a.json"');
  });

  it('stops at eight and counts the rest', async () => {
    const asked = await askAbout(Array.from({ length: 20 }, (_, i) => file(`f${i}.json`)));

    // There was no cap at all: twenty names, or four hundred, all went in.
    expect(asked.description).toContain('and 12 more');
    expect(asked.description).not.toContain('f8.json');
  });

  it('does not repeat the count the title already gives', async () => {
    const asked = await askAbout([file('a.json'), file('b.json')]);

    expect(asked.title).toBe('Delete 2 items forever?');
    expect(asked.description).not.toContain('2 items will be deleted');
  });

  it('marks a folder so a plain list can still tell you it is one', async () => {
    const asked = await askAbout([folder('photos'), file('a.json')]);

    expect(asked.description).toContain('photos/');
    expect(asked.description).toContain('a.json');
  });
});

describe('the warning a folder earns', () => {
  it('says a folder takes its contents with it', async () => {
    const asked = await askAbout([folder('photos'), file('a.json'), file('b.json')]);

    expect(asked.description).toContain('everything inside it');
  });

  it('says nothing about folders when none are selected', async () => {
    const asked = await askAbout([file('a.json'), file('b.json')]);

    expect(asked.description).not.toContain('everything inside it');
    expect(asked.description).toContain('This action cannot be undone.');
  });

  it('matches the single-folder dialog when one folder is selected', async () => {
    const asked = await askAbout([folder('photos')]);

    // The same sentence the folder overflow menu has always used. Selecting a
    // folder and selecting it through the menu should not warn differently.
    expect(asked.title).toBe('Delete forever?');
    expect(asked.description).toBe(
      '"photos" and everything inside it will be deleted forever. This action cannot be undone.'
    );
  });

  it('keeps a single file to its own sentence', async () => {
    const asked = await askAbout([file('report.json')]);

    expect(asked.description).toBe(
      '"report.json" will be deleted forever. This action cannot be undone.'
    );
  });
});
