import type { Element } from 'hast';

/** An element's classes, however the node was built. */
export function classList(node: Element): string[] {
  // Parsed HTML gives an array; Shiki and hand-built nodes may give a string.
  const value: unknown = node.properties?.className;
  if (Array.isArray(value)) return value.map(String);
  return typeof value === 'string' ? value.split(/\s+/).filter(Boolean) : [];
}
