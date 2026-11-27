import { describe, expect, it } from 'vitest';
import { needsFullPageLoad, pageProfileFor } from './page-profile';
import { isTrackedPath } from '../analytics/tracked-paths';

describe('which pages get the public policy', () => {
  it.each([
    '/',
    '/blog',
    '/blog/',
    '/blog/a-post',
    '/blog/author/yash',
    '/blog/category/troubleshooting',
    '/privacy',
    '/terms',
  ])('%s is public', (path) => {
    expect(pageProfileFor(path)).toBe('public');
  });

  it.each([
    '/connect',
    '/connect/aws',
    '/dashboard',
    '/dashboard/browse',
    '/blog/a-post/cover.png',
    '/anything-new',
  ])('%s gets the app policy', (path) => {
    expect(pageProfileFor(path)).toBe('app');
  });
});

describe('links that must load a new document', () => {
  it.each(['/connect', '/connect/aws?x=1', '/dashboard#top'])('%s does', (href) => {
    expect(needsFullPageLoad(href)).toBe(true);
  });

  it.each([
    '/',
    '/blog',
    '/privacy#storage',
    'https://github.com/x',
    '//evil.example/connect',
    '#faq',
  ])('%s does not', (href) => {
    expect(needsFullPageLoad(href)).toBe(false);
  });
});

describe('pages that may send analytics', () => {
  it.each(['/', '/blog', '/blog/a-post', '/blog/author/yash', '/blog/category/guides'])(
    '%s may',
    (path) => {
      expect(isTrackedPath(path)).toBe(true);
    }
  );

  // A tracked page must also be a public one: its policy is the only one that
  // names the analytics host.
  it('are all public pages', () => {
    for (const path of ['/', '/blog', '/blog/a-post']) expect(pageProfileFor(path)).toBe('public');
  });

  it.each([
    '/connect',
    '/dashboard',
    '/dashboard/preview/x',
    '/privacy',
    '/terms',
    '/blog/a/cover.png',
  ])('%s may not', (path) => {
    expect(isTrackedPath(path)).toBe(false);
  });
});
