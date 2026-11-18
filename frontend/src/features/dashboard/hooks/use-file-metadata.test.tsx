/**
 * useFileMetadata, behind the details panel.
 *
 * It returned early before its effect while the session loaded, so its hook
 * count changed once sign-in finished. And with no way to drop a late answer,
 * clicking from one file to the next could show the first one's details for
 * the second.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { FileItem } from '@/features/dashboard/types/file';

const session = vi.hoisted(() => ({ current: { apiS3: null as unknown } }));
vi.mock('@/hooks/use-auth-guard', () => ({ useAuthGuard: () => session.current }));

import { useFileMetadata } from './use-file-metadata';

const fileNamed = (name: string): FileItem => ({
  id: name,
  Key: `docs/${name}`,
  name,
  extension: 'pdf',
  size: { value: 1, unit: 'MB' },
});

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFileMetadata', () => {
  it('keeps its hooks the same while the session arrives', async () => {
    session.current = { apiS3: null };
    const fetchMetadata = vi.fn(async () => ({ ContentType: 'application/pdf', ContentLength: 9 }));
    const file = fileNamed('a.pdf');

    const { result, rerender } = renderHook(() => useFileMetadata(file));
    expect(result.current.isLoading).toBe(true);

    session.current = { apiS3: { fetchMetadata } };
    rerender();

    await waitFor(() => expect(result.current.metadata?.contentType).toBe('application/pdf'));
    expect(errors.mock.calls.flat().map(String).join(' ')).not.toMatch(/hooks/i);
  });

  it('drops a late answer for a file that is no longer selected', async () => {
    let answerFirst!: (value: unknown) => void;
    const fetchMetadata = vi.fn((key: string) =>
      key === 'docs/first.pdf'
        ? new Promise((resolve) => (answerFirst = resolve))
        : Promise.resolve({ ContentType: 'text/plain', ContentLength: 2 })
    );
    session.current = { apiS3: { fetchMetadata } };

    let file = fileNamed('first.pdf');
    const { result, rerender } = renderHook(() => useFileMetadata(file));

    file = fileNamed('second.txt');
    rerender();
    await waitFor(() => expect(result.current.metadata?.contentType).toBe('text/plain'));

    // The first file's answer finally arrives.
    answerFirst({ ContentType: 'application/pdf', ContentLength: 9 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.metadata?.contentType).toBe('text/plain');
    expect(result.current.isLoading).toBe(false);
  });
});
