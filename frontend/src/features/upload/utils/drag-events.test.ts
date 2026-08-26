/**
 * Reading a drag from the event.
 *
 * These three functions replaced a React context that had to be written by one
 * component before another could read it. The tests worth having are the ones
 * that pin down the properties that made the swap worthwhile: an answer that
 * depends on nothing but its argument, and a target that comes from where the
 * pointer actually is.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  DROP_TARGET_ATTRIBUTE,
  dropTargetIdAt,
  folderTargetId,
  isExternalFileDrag,
} from './drag-events';

function transfer(types: string[] | undefined): DataTransfer {
  return { types } as unknown as DataTransfer;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('folderTargetId', () => {
  it('namespaces the id so a folder cannot collide with another kind of target', () => {
    expect(folderTargetId('docs/photos/')).toBe('folder-docs/photos/');
  });
});

describe('isExternalFileDrag', () => {
  it('recognises files dragged in from outside the browser', () => {
    expect(isExternalFileDrag(transfer(['Files']))).toBe(true);
  });

  it('recognises them alongside the other types a drop carries', () => {
    // Chrome reports 'Files' next to its own entries; the order is not fixed.
    expect(isExternalFileDrag(transfer(['text/plain', 'Files']))).toBe(true);
  });

  it('rejects a drag that carries no files', () => {
    // A row dragged within the list would look like this. Treating it as an
    // upload would light up every folder and start one on a stray drop.
    expect(isExternalFileDrag(transfer(['text/plain']))).toBe(false);
  });

  it('rejects an empty type list', () => {
    expect(isExternalFileDrag(transfer([]))).toBe(false);
  });

  it('rejects a missing dataTransfer', () => {
    // Native drag events type this as nullable, and synthetic ones often omit it.
    expect(isExternalFileDrag(null)).toBe(false);
    expect(isExternalFileDrag(undefined)).toBe(false);
  });

  it('rejects a dataTransfer with no types at all', () => {
    expect(isExternalFileDrag(transfer(undefined))).toBe(false);
  });

  it('reads a list-like types collection', () => {
    // Older engines hand back a DOMStringList rather than an array, which has
    // no .includes of its own.
    const listLike = { 0: 'Files', length: 1 } as unknown as readonly string[];
    expect(isExternalFileDrag({ types: listLike } as unknown as DataTransfer)).toBe(true);
  });
});

describe('dropTargetIdAt', () => {
  it('finds the folder an element sits inside', () => {
    document.body.innerHTML = `
      <div ${DROP_TARGET_ATTRIBUTE}="folder-a"><span id="label">Photos</span></div>
    `;

    // The pointer is over the row's label, never the row itself - which is why
    // reading the event target alone was never enough.
    expect(dropTargetIdAt(document.getElementById('label'))).toBe('folder-a');
  });

  it('takes the innermost folder when they nest', () => {
    document.body.innerHTML = `
      <div ${DROP_TARGET_ATTRIBUTE}="folder-outer">
        <div ${DROP_TARGET_ATTRIBUTE}="folder-inner"><span id="label">x</span></div>
      </div>
    `;

    // The same one the browser would deliver the drop to.
    expect(dropTargetIdAt(document.getElementById('label'))).toBe('folder-inner');
  });

  it('matches the element itself, not only its descendants', () => {
    document.body.innerHTML = `<div id="row" ${DROP_TARGET_ATTRIBUTE}="folder-a"></div>`;

    expect(dropTargetIdAt(document.getElementById('row'))).toBe('folder-a');
  });

  it('returns null outside any folder', () => {
    document.body.innerHTML = `<div id="gap"></div>`;

    // The gap between rows is the listing itself, and uploads to its prefix.
    expect(dropTargetIdAt(document.getElementById('gap'))).toBeNull();
  });

  it('walks up from a text node', () => {
    document.body.innerHTML = `<div ${DROP_TARGET_ATTRIBUTE}="folder-a">Photos</div>`;
    const text = document.body.querySelector('div')!.firstChild;

    expect(dropTargetIdAt(text)).toBe('folder-a');
  });

  it('returns null for a missing target', () => {
    expect(dropTargetIdAt(null)).toBeNull();
  });

  it('returns null for a target that is not a node', () => {
    // dragover fires on window too, whose target is no part of the document.
    expect(dropTargetIdAt(window)).toBeNull();
  });
});
