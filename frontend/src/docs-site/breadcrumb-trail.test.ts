/**
 * The docs' breadcrumb trail, which feeds its BreadcrumbList structured data.
 *
 * Tested here because the docs site has no test runner of its own; this is the
 * suite CI runs. The module has no Nextra imports, so it runs outside Next.
 */
import { describe, expect, it } from 'vitest';
import { breadcrumbTrail } from '../../../docs/lib/breadcrumb-trail';

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
      expect(crumb.url.startsWith(DOCS)).toBe(true);
      expect(crumb.url.endsWith('/')).toBe(false);
    }
  });
});
