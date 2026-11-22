/**
 * Pictures in a post: loaded when they come near, and opened larger on a press.
 *
 * Every picture in the body sits below the cover, so it is loaded lazily and
 * decoded off the main thread.
 *
 * A picture that stands on its own - in a figure, or alone in its paragraph -
 * is wrapped in a button that opens it full size (see ImageLightbox): a
 * diagram drawn for a wide canvas is hard to read at the width of a column. A
 * button rather than a click on the picture, so a keyboard can open it too.
 * Pictures that are part of a sentence (an icon, a badge, an emoji) and
 * pictures that are links are left as they are: the button is a block, and
 * would break the sentence around them.
 */

import type { Element, ElementContent, Root, RootContent } from 'hast';
import { h } from 'hastscript';
import { toString } from 'hast-util-to-string';
import { visit, SKIP } from 'unist-util-visit';
import { classList } from './hast';

/** WordPress's emoji and smiley images, which are text in picture form. */
const INLINE_IMAGE_CLASSES = new Set(['emoji', 'wp-smiley']);

/** Parents a picture can sit in and still be a picture of its own. */
const BLOCK_PARENTS = new Set(['figure', 'div', 'section', 'article', 'main']);

type Parent = Root | Element;

/**
 * Whether `node` is the only thing in its parent worth reading: no text
 * beside it but whitespace, no element beside it but line breaks (or, in a
 * figure, the caption).
 */
function standsAlone(node: Element, parent: Parent): boolean {
  if (parent.type === 'root') return true;
  if (BLOCK_PARENTS.has(parent.tagName)) return true;

  return parent.children.every((sibling: RootContent | ElementContent) => {
    if (sibling === node) return true;
    if (sibling.type === 'text') return sibling.value.trim() === '';
    if (sibling.type === 'comment') return true;
    if (sibling.type === 'element') {
      return sibling.tagName === 'br' || (sibling.tagName === 'span' && !toString(sibling).trim());
    }
    return true;
  });
}

export function prepareImages(tree: Root): void {
  // Every picture loads lazily, linked or not.
  visit(tree, 'element', (node) => {
    if (node.tagName !== 'img') return;
    node.properties.loading ??= 'lazy';
    node.properties.decoding ??= 'async';
  });

  const zoomable: Array<{ node: Element; img: Element; index: number; parent: Parent }> = [];

  visit(tree, 'element', (node, index, parent) => {
    // A picture that is a link already goes where its link goes.
    if (node.tagName === 'a' || node.tagName === 'button') return SKIP;
    if (index === undefined || !parent) return;

    // A <picture> is wrapped whole: its <img> must stay its direct child, or
    // the browser ignores the <source> entries and loads the fallback.
    const isPicture = node.tagName === 'picture';
    if (!isPicture && node.tagName !== 'img') return;

    const img = isPicture
      ? node.children.find(
          (child): child is Element => child.type === 'element' && child.tagName === 'img'
        )
      : node;
    if (!img) return SKIP;
    if (classList(img).some((name) => INLINE_IMAGE_CLASSES.has(name))) return SKIP;
    if (!standsAlone(node, parent as Parent)) return SKIP;

    zoomable.push({ node, img, index, parent: parent as Parent });
    return SKIP;
  });

  for (const { node, img, index, parent } of zoomable) {
    const alt = typeof img.properties.alt === 'string' ? img.properties.alt.trim() : '';
    parent.children[index] = h(
      'button.image-zoom',
      {
        type: 'button',
        dataImageZoom: '',
        // The picture's own description is what the reader is choosing.
        ariaLabel: alt ? `View larger: ${alt}` : 'View image larger',
      },
      [node]
    ) as ElementContent;
  }
}
