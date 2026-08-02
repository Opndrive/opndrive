/**
 * Folder drop target: the drag handlers a folder row spreads onto itself.
 *
 * The hook reads its drag state from EnhancedDragDropProvider, which is mocked
 * at the module boundary - what matters here is the handler logic, not the
 * provider's own bookkeeping.
 *
 * The recurring rule is that every handler is inert unless an EXTERNAL file
 * drag is in progress. Without that guard, dragging a file row across the list
 * to reorder it would light up every folder as a drop target and a stray drop
 * would start an upload.
 *
 * This is the first suite to use renderHook. Phase 2 excluded it deliberately;
 * a hook that returns event handlers cannot be exercised any other way.
 *
 * The synchronous handlers are called directly, NOT wrapped in act(). The
 * provider is mocked, so they only invoke vi.fn() spies - there is no React
 * state update and therefore no update queue to flush, and wrapping would be
 * noise. act() is kept on the async drop path, where real awaited work runs
 * and where a future switch to the real provider would need it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFolderDropTarget } from './use-folder-drop-target';
import { FolderStructureProcessor } from '../utils/folder-structure-processor';
import type { DragDropSource } from '../types/drag-drop-types';

const { context } = vi.hoisted(() => ({
  context: {
    source: null as DragDropSource | null,
    registerDropTarget: vi.fn(),
    unregisterDropTarget: vi.fn(),
    setHoverTarget: vi.fn(),
    getTargetState: vi.fn(() => ({
      isHovered: false,
      canAcceptDrop: true,
      isDraggedOver: false,
    })),
  },
}));

vi.mock('../providers/enhanced-drag-drop-provider', () => ({
  useEnhancedDragDrop: () => context,
}));

vi.mock('../utils/folder-structure-processor', () => ({
  FolderStructureProcessor: { processDataTransferItems: vi.fn() },
}));

const processItems = vi.mocked(FolderStructureProcessor.processDataTransferItems);

const externalDrag: DragDropSource = { type: 'external-files', items: [], count: 1 };
const internalDrag: DragDropSource = { type: 'internal-files', items: [], count: 1 };

const folder = { id: 'f1', name: 'Photos', path: 'docs/photos/' };

/**
 * A drag event with the bits the handlers touch. `getBoundingClientRect` backs
 * the leave test's inside/outside check.
 */
function dragEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { items: {} as DataTransferItemList, dropEffect: 'none' },
    clientX: 50,
    clientY: 50,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 100 }),
    },
    ...overrides,
  } as unknown as React.DragEvent;
}

function mount(onFilesDropped = vi.fn()) {
  const rendered = renderHook(() => useFolderDropTarget({ folder, onFilesDropped }));
  return { ...rendered, onFilesDropped };
}

beforeEach(() => {
  vi.clearAllMocks();
  context.source = null;
  context.getTargetState.mockReturnValue({
    isHovered: false,
    canAcceptDrop: true,
    isDraggedOver: false,
  });
  processItems.mockResolvedValue({ individualFiles: [], folderStructures: [] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('registration', () => {
  it('registers the folder as a drop target on mount', () => {
    mount();

    expect(context.registerDropTarget).toHaveBeenCalledWith({
      type: 'folder',
      id: 'folder-f1',
      path: 'docs/photos/',
      name: 'Photos',
    });
  });

  it('unregisters on unmount', () => {
    const { unmount } = mount();

    unmount();

    // A folder scrolled out of the virtualised list must stop claiming drops.
    expect(context.unregisterDropTarget).toHaveBeenCalledWith('folder-f1');
  });

  it('namespaces the target id so folders cannot collide with other targets', () => {
    mount();

    expect(context.registerDropTarget).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'folder-f1' })
    );
  });
});

describe('dragEnter', () => {
  it('marks the folder hovered during an external drag', () => {
    context.source = externalDrag;
    const { result } = mount();
    const event = dragEvent();

    result.current.dragHandlers.onDragEnter(event);

    expect(context.setHoverTarget).toHaveBeenCalledWith({
      type: 'folder',
      id: 'folder-f1',
      path: 'docs/photos/',
      name: 'Photos',
    });
    // Without preventDefault the browser refuses the drop outright.
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('ignores an internal drag', () => {
    context.source = internalDrag;
    const { result } = mount();
    const event = dragEvent();

    result.current.dragHandlers.onDragEnter(event);

    // Dragging a row within the list must not light up folders as targets.
    expect(context.setHoverTarget).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('ignores an enter with no drag in progress', () => {
    const { result } = mount();

    result.current.dragHandlers.onDragEnter(dragEvent());

    expect(context.setHoverTarget).not.toHaveBeenCalled();
  });
});

describe('dragLeave', () => {
  beforeEach(() => {
    context.source = externalDrag;
  });

  it('clears the hover once the pointer is outside the row', () => {
    const { result } = mount();

    result.current.dragHandlers.onDragLeave(dragEvent({ clientX: 150, clientY: 50 }));

    expect(context.setHoverTarget).toHaveBeenCalledWith(null);
  });

  it('keeps the hover while the pointer is still inside', () => {
    const { result } = mount();

    result.current.dragHandlers.onDragLeave(dragEvent({ clientX: 50, clientY: 50 }));

    // dragleave also fires when crossing onto a CHILD element. Clearing then
    // would make the highlight flicker off as the pointer moves over the row's
    // icon or label.
    expect(context.setHoverTarget).not.toHaveBeenCalled();
  });

  it.each([
    ['left of the row', { clientX: -1, clientY: 50 }],
    ['right of the row', { clientX: 101, clientY: 50 }],
    ['above the row', { clientX: 50, clientY: -1 }],
    ['below the row', { clientX: 50, clientY: 101 }],
  ])('clears the hover when the pointer is %s', (_label, coords) => {
    const { result } = mount();

    result.current.dragHandlers.onDragLeave(dragEvent(coords));

    expect(context.setHoverTarget).toHaveBeenCalledWith(null);
  });

  it('treats the exact edge as still inside', () => {
    const { result } = mount();

    result.current.dragHandlers.onDragLeave(dragEvent({ clientX: 100, clientY: 100 }));

    // The bounds check is exclusive, so the boundary pixel stays hovered.
    expect(context.setHoverTarget).not.toHaveBeenCalled();
  });

  it('ignores an internal drag', () => {
    context.source = internalDrag;
    const { result } = mount();

    result.current.dragHandlers.onDragLeave(dragEvent({ clientX: 999 }));

    expect(context.setHoverTarget).not.toHaveBeenCalled();
  });
});

describe('dragOver', () => {
  it('asks the browser for a copy cursor during an external drag', () => {
    context.source = externalDrag;
    const { result } = mount();
    const event = dragEvent();

    result.current.dragHandlers.onDragOver(event);

    // Without preventDefault on dragover the drop event never fires at all.
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.dataTransfer.dropEffect).toBe('copy');
  });

  it('leaves the cursor alone for an internal drag', () => {
    context.source = internalDrag;
    const { result } = mount();
    const event = dragEvent();

    result.current.dragHandlers.onDragOver(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.dataTransfer.dropEffect).toBe('none');
  });
});

describe('drop', () => {
  beforeEach(() => {
    context.source = externalDrag;
  });

  it('hands the extracted files to the caller with this folder as the target', async () => {
    const extracted = { individualFiles: [new File([], 'a.txt')], folderStructures: [] };
    processItems.mockResolvedValue(extracted);
    const { result, onFilesDropped } = mount();

    await act(async () => result.current.dragHandlers.onDrop(dragEvent()));

    expect(onFilesDropped).toHaveBeenCalledExactlyOnceWith(extracted, {
      type: 'folder',
      id: 'folder-f1',
      path: 'docs/photos/',
      name: 'Photos',
    });
  });

  it('clears the hover afterwards', async () => {
    const { result } = mount();

    await act(async () => result.current.dragHandlers.onDrop(dragEvent()));

    // A highlight left behind would follow the user around the list.
    expect(context.setHoverTarget).toHaveBeenLastCalledWith(null);
  });

  it('ignores an internal drag', async () => {
    context.source = internalDrag;
    const { result, onFilesDropped } = mount();

    await act(async () => result.current.dragHandlers.onDrop(dragEvent()));

    expect(processItems).not.toHaveBeenCalled();
    expect(onFilesDropped).not.toHaveBeenCalled();
  });

  it('ignores a drop with no drag registered', async () => {
    context.source = null;
    const { result, onFilesDropped } = mount();

    await act(async () => result.current.dragHandlers.onDrop(dragEvent()));

    expect(onFilesDropped).not.toHaveBeenCalled();
  });

  it('ignores a drop carrying no dataTransfer', async () => {
    const { result, onFilesDropped } = mount();

    await act(async () => result.current.dragHandlers.onDrop(dragEvent({ dataTransfer: null })));

    // Some synthetic events arrive without one; reading .items would throw.
    expect(onFilesDropped).not.toHaveBeenCalled();
  });

  it('does not crash when extraction fails', async () => {
    processItems.mockRejectedValue(new Error('SecurityError'));
    const { result, onFilesDropped } = mount();

    await act(async () => result.current.dragHandlers.onDrop(dragEvent()));

    expect(onFilesDropped).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('still clears the hover when extraction fails', async () => {
    processItems.mockRejectedValue(new Error('SecurityError'));
    const { result } = mount();

    await act(async () => result.current.dragHandlers.onDrop(dragEvent()));

    // Otherwise a failed drop leaves the folder permanently highlighted.
    expect(context.setHoverTarget).toHaveBeenLastCalledWith(null);
  });

  it('survives the row unmounting while extraction is still running', async () => {
    // Drop a folder, navigate away, and the walk is still going. Everything the
    // continuation touches lives ABOVE this component - setHoverTarget belongs
    // to the provider and onFilesDropped to the upload store - so there is no
    // setState on an unmounted component. React 19 would not warn either way,
    // which is exactly why this is worth asserting rather than assuming.
    let release!: (v: { individualFiles: File[]; folderStructures: [] }) => void;
    processItems.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const { result, unmount, onFilesDropped } = mount();

    const dropping = result.current.dragHandlers.onDrop(dragEvent());
    unmount();
    release({ individualFiles: [new File([], 'a.txt')], folderStructures: [] });
    await act(async () => {
      await dropping;
    });

    // The upload still starts: the user asked for it before navigating away.
    expect(onFilesDropped).toHaveBeenCalledOnce();
    expect(context.unregisterDropTarget).toHaveBeenCalledWith('folder-f1');
  });

  it('forwards an empty extraction rather than swallowing it', async () => {
    processItems.mockResolvedValue({ individualFiles: [], folderStructures: [] });
    const { result, onFilesDropped } = mount();

    await act(async () => result.current.dragHandlers.onDrop(dragEvent()));

    // Dropping something that yields nothing is the caller's call to report.
    expect(onFilesDropped).toHaveBeenCalledOnce();
  });
});

describe('reported state', () => {
  it('can accept a drop while an external drag is running', () => {
    context.source = externalDrag;

    const { result } = mount();

    expect(result.current.canAcceptDrop).toBe(true);
  });

  it('cannot accept a drop with no drag in progress', () => {
    context.source = null;

    const { result } = mount();

    // The row must not render as a live target when nothing is being dragged.
    expect(result.current.canAcceptDrop).toBe(false);
  });

  it('cannot accept a drop the provider has ruled out', () => {
    context.source = externalDrag;
    context.getTargetState.mockReturnValue({
      isHovered: false,
      canAcceptDrop: false,
      isDraggedOver: false,
    });

    const { result } = mount();

    expect(result.current.canAcceptDrop).toBe(false);
  });

  it('passes the provider target state straight through', () => {
    const state = { isHovered: true, canAcceptDrop: true, isDraggedOver: true };
    context.getTargetState.mockReturnValue(state);

    const { result } = mount();

    expect(result.current.targetState).toEqual(state);
  });
});
