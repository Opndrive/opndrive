/**
 * The preview page is a 404 to anyone not in draft mode, and never indexed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ draftEnabled: false }));

vi.mock('next/headers', () => ({
  draftMode: async () => ({ isEnabled: state.draftEnabled }),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('@/lib/wordpress/client', () => ({
  isWordPressConfigured: () => true,
  isPreviewConfigured: () => true,
}));

vi.mock('@/lib/wordpress/service', () => ({
  getPreviewPost: vi.fn(async () => {
    throw new Error('must not be asked');
  }),
}));

import PreviewPostPage, { metadata } from './page';

beforeEach(() => {
  state.draftEnabled = false;
});

describe('/preview/post/[id]', () => {
  it('is a 404 without draft mode, before WordPress is even asked', async () => {
    await expect(PreviewPostPage({ params: Promise.resolve({ id: '42' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
  });

  it('is a 404 for an ID that is not a number', async () => {
    state.draftEnabled = true;

    await expect(PreviewPostPage({ params: Promise.resolve({ id: '42x' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
  });

  it('is never indexed', () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
});
