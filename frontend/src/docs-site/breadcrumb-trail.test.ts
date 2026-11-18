/**
 * The docs' breadcrumb trail, which feeds its BreadcrumbList structured data.
 *
 * Tested here because the docs site has no test runner of its own; this is the
 * suite CI runs. The module has no Nextra imports, so it runs outside Next.
 */
import { describe, expect, it } from 'vitest';
import { createElement, Fragment } from 'react';
import { breadcrumbTrail, titleText } from '../../../docs/lib/breadcrumb-trail';

const DOCS = 'https://docs.opndrive.app';

// The shape Nextra's normalizePages gives for /guides/<page>: the section
// folder, then the page.
const guides = {
  route: '/guides',
  title: 'Guides',
  children: [{ route: '/guides/connecting-storage' }, { route: '/guides/uploading-files' }],
};
const page = (route: string, title: string) => ({ route, title, frontMatter: {} });

describe('breadcrumbTrail', () => {
  it('runs from the docs home through the section to the page', () => {
    expect(breadcrumbTrail([guides, page('/guides/uploading-files', 'Uploading Files')])).toEqual([
      { name: 'Opndrive Docs', url: DOCS },
      { name: 'Guides', url: `${DOCS}/guides/connecting-storage` },
      { name: 'Uploading Files', url: `${DOCS}/guides/uploading-files` },
    ]);
  });

  it("leaves the section out when its first page is this page, as Nextra's breadcrumb does", () => {
    // A section crumb would otherwise carry this page's own URL twice.
    expect(
      breadcrumbTrail([guides, page('/guides/connecting-storage', 'Connecting Your Storage')])
    ).toEqual([
      { name: 'Opndrive Docs', url: DOCS },
      { name: 'Connecting Your Storage', url: `${DOCS}/guides/connecting-storage` },
    ]);
  });

  it('gives every crumb an absolute URL with no trailing slash', () => {
    const trail = breadcrumbTrail([guides, page('/guides/uploading-files', 'Uploading Files')]);
    for (const crumb of trail) {
      // The parsed origin, not a prefix: a prefix would also pass
      // https://docs.opndrive.app.example.com.
      expect(new URL(crumb.url).origin).toBe(DOCS);
      expect(crumb.url.endsWith('/')).toBe(false);
    }
  });
});

describe('titleText', () => {
  it('reads a plain title as it is', () => {
    expect(titleText('Guides')).toBe('Guides');
    expect(titleText(42)).toBe('42');
  });

  it("reads the text out of a JSX title, as Nextra's _meta files allow", () => {
    const title = createElement(
      Fragment,
      null,
      createElement('span', null, 'Getting'),
      ' ',
      createElement('b', null, 'Started')
    );
    expect(titleText(title)).toBe('Getting Started');
  });

  it('gives nothing, not "[object Object]", for what has no text', () => {
    expect(titleText(undefined)).toBe('');
    expect(titleText(null)).toBe('');
    expect(titleText(false)).toBe('');
    expect(titleText({})).toBe('');
  });

  it('names a crumb by the text of its JSX title', () => {
    const section = { ...guides, title: createElement('span', null, 'Guides') };
    const [, crumb] = breadcrumbTrail([
      section,
      page('/guides/uploading-files', 'Uploading Files'),
    ]);
    expect(crumb).toEqual({ name: 'Guides', url: `${DOCS}/guides/connecting-storage` });
  });
});
