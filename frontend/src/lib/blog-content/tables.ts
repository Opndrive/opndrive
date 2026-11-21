/**
 * Tables that can scroll on their own.
 *
 * A wide table - long inline code in a cell is enough - used to widen the
 * whole post on a phone, zooming every line out with it. The fix is a wrapper
 * that scrolls sideways (`.table-wrap` in globals.css). The current posts ship
 * that wrapper from WordPress; this adds it to any table that arrives without
 * one, so the next post does not depend on its author remembering.
 */

import type { Element, ElementContent, Root } from 'hast';
import { h } from 'hastscript';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';
import { classList } from './hast';

export function wrapTables(tree: Root): void {
  const bare: Array<{ node: Element; index: number; parent: Root | Element }> = [];

  visit(tree, 'element', (node, index, parent) => {
    if (node.tagName !== 'table' || index === undefined || !parent) return;
    const wrapped = parent.type === 'element' && classList(parent).includes('table-wrap');
    if (!wrapped) bare.push({ node, index, parent: parent as Root | Element });
    return 'skip';
  });

  for (const { node, index, parent } of bare) {
    const caption = node.children.find(
      (child): child is Element => child.type === 'element' && child.tagName === 'caption'
    );
    const label = caption ? toString(caption).replace(/\s+/g, ' ').trim() : '';

    // A scrollable region a keyboard can reach and a screen reader can name,
    // as the wrapper WordPress writes does.
    parent.children[index] = h(
      'div.table-wrap',
      { role: 'region', tabIndex: 0, ariaLabel: label || 'Table' },
      [node]
    ) as ElementContent;
  }
}
