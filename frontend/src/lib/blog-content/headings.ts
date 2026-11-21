/**
 * Section headings: an id on each, a link to itself, and a list for the table
 * of contents.
 *
 * Every `<h2>` and `<h3>` gets an id - WordPress's own where it wrote one, a
 * slug of the text where it did not - so each section has an address. The
 * heading's text becomes a link to that address, as MDN does it: the heading
 * keeps its name for a screen reader ("Step 2: replay the request with curl",
 * not that plus "link to this section"), and pressing it copies the section's
 * link (see PostContentListener). A heading that already holds a link is left
 * as it is, since links cannot nest.
 */

import type { Element, Root } from 'hast';
import GithubSlugger from 'github-slugger';
import { h, s } from 'hastscript';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';

/** Fewer top-level sections than this, and a table of contents adds nothing. */
export const TOC_MIN_SECTIONS = 3;

export interface PostHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

function hasLink(node: Element): boolean {
  let found = false;
  visit(node, 'element', (child) => {
    if (child.tagName === 'a') {
      found = true;
      return false;
    }
  });
  return found;
}

// Lucide's "link", shown after the text while the heading is pointed at or
// focused, so the link has a visible sign without changing how headings read.
function linkIcon(): Element {
  return s(
    'svg.heading-anchor-icon',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: 18,
      height: 18,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      ariaHidden: 'true',
      focusable: 'false',
    },
    [
      s('path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }),
      s('path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }),
    ]
  );
}

/** Gives headings ids and self-links, in place, and lists them in order. */
export function linkHeadings(tree: Root): PostHeading[] {
  const headings: Element[] = [];
  const taken = new Set<string>();

  visit(tree, 'element', (node) => {
    const id = node.properties?.id;
    if (typeof id === 'string' && id) taken.add(id);
    if (node.tagName === 'h2' || node.tagName === 'h3') headings.push(node);
  });

  const slugger = new GithubSlugger();
  const list: PostHeading[] = [];

  for (const heading of headings) {
    const text = toString(heading).replace(/\s+/g, ' ').trim();
    if (!text) continue;

    let id = typeof heading.properties.id === 'string' ? heading.properties.id : '';
    if (!id) {
      // Slugs the author's ids already use are skipped, so no two sections
      // share an address.
      do {
        id = slugger.slug(text) || 'section';
      } while (taken.has(id));
      taken.add(id);
      heading.properties.id = id;
    }

    list.push({ id, text, level: heading.tagName === 'h2' ? 2 : 3 });

    if (!hasLink(heading)) {
      heading.children = [
        h('a.heading-anchor', { href: `#${id}`, dataHeadingAnchor: '' }, [
          ...heading.children,
          linkIcon(),
        ]),
      ];
    }
  }

  return list;
}
