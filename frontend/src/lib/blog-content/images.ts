/**
 * Pictures in a post: loaded when they come near, and opened larger on a press.
 *
 * Every picture in the body sits below the cover, so it is loaded lazily and
 * decoded off the main thread. Each one that is not already a link is wrapped
 * in a button that opens it full size (see ImageLightbox): a diagram drawn for
 * a wide canvas is hard to read at the width of a column. A button rather than
 * a click on the picture, so a keyboard can open it too.
 */

import type { Element, ElementContent, Root } from 'hast';
import { h } from 'hastscript';
import { visit, SKIP } from 'unist-util-visit';

export function prepareImages(tree: Root): void {
  const zoomable: Array<{ node: Element; index: number; parent: Root | Element }> = [];

  visit(tree, 'element', (node, index, parent) => {
    // A picture that is a link already goes where its link goes.
    if (node.tagName === 'a' || node.tagName === 'button') return SKIP;
    if (node.tagName !== 'img' || index === undefined || !parent) return;

    node.properties.loading ??= 'lazy';
    node.properties.decoding ??= 'async';
    zoomable.push({ node, index, parent: parent as Root | Element });
  });

  for (const { node, index, parent } of zoomable) {
    const alt = typeof node.properties.alt === 'string' ? node.properties.alt.trim() : '';
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
