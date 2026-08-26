/**
 * Folder drop target: the drag handlers a folder row spreads onto itself.
 *
 * The rule the whole suite turns on is that the row decides for itself, from
 * the event in hand. It used to ask the provider whether a drag was in
 * progress, which meant it could only work if some other handler had already
 * recorded one - and in the list view none ever did, because the file table
 * stopped the events before they got that far. So the tests here pass no drag
 * state in: a handler either recognises the drop from its own event or it does
 * not.
 *
 * The provider is still mocked, but only for the one thing it now owns: which
 * folder the pointer is over.
 *
 * The synchronous handler is called directly, NOT wrapped in act(). It touches
 * no React state, so there is no update queue to flush and wrapping would be
 * noise. act() is kept on the async drop path, where real awaited work runs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFolderDropTarget } from './use-folder-drop-target';
import { FolderStructureProcessor } from '../utils/folder-structure-processor';
import { DROP_TARGET_ATTRIBUTE } from '../utils/drag-events';
import type { ProcessedDragData } from '../types/folder-upload-types';

const { context } = vi.hoisted(() => ({
  context: { hoveredTargetId: null as string | null },
}));

vi.mock('../providers/enhanced-drag-drop-provider', () => ({
  useEnhancedDragDrop: () => context,
}));

vi.mock('../utils/folder-structure-processor', () => ({
  FolderStructureProcessor: { processDataTransferItems: vi.fn() },
}));

const processItems = vi.mocked(FolderStructureProcessor.processDataTransferItems);

const folder = { id: 'f1', name: 'Photos', path: 'docs/photos/' };
const target = { type: 'folder', id: 'folder-f1', path: 'docs/photos/', name: 'Photos' };

/**
 * A drag event carrying whichever types the case is about. `types` is the only
 * thing a browser exposes mid-drag, and so the only thing the handlers read.
 */
function dragEvent(types: string[] | null = ['Files']) {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: types ? { types, items: {} as DataTransferItemList, dropEffect: 'none' } : null,
  } as unknown as React.DragEvent;
}

function mount(onFilesDropped = vi.fn()) {
  const rendered = renderHook(() => useFolderDropTarget({ folder, onFilesDropped }));
  return { ...rendered, onFilesDropped };
}

beforeEach(() => {
  vi.clearAllMocks();
  context.hoveredTargetId = null;
  processItems.mockResolvedValue({ individualFiles: [], folderStructures: [], skipped: [] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('marking the row', () => {
  it('tags the row with its namespaced target id', () => {
    const { result } = mount();

    // This attribute is the whole registration: the provider hit-tests the
    // pointer against it, so a row scrolled out of the DOM stops claiming
    // drops without having to announce that it has gone.
    expect(result.current.dragHandlers[DROP_TARGET_ATTRIBUTE]).toBe('folder-f1');
  });
});

describe('dragOver', () => {
  it('claims the drop and asks for a copy cursor during a file drag', () => {
    const { result } = mount();
    const event = dragEvent();

    result.current.dragHandlers.onDragOver(event);

    // An element that does not cancel dragover never receives a drop at all.
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.dataTransfer.dropEffect).toBe('copy');
  });

  it('works without any prior event having been seen', () => {
    // The regression this hook was rewritten for: the first event of a drag
    // that began over the listing had to be enough on its own.
    const { result } = mount();
    const event = dragEvent();

    result.current.dragHandlers.onDragOver(event);

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('leaves a drag that carries no files alone', () => {
    const { result } = mount();
    const event = dragEvent(['text/plain']);

    result.current.dragHandlers.onDragOver(event);

    // Dragging a row within the list must not turn every folder into a target.
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.dataTransfer.dropEffect).toBe('none');
  });

  it('survives an event with no dataTransfer', () => {
    const { result } = mount();
    const event = dragEvent(null);

    expect(() => result.current.dragHandlers.onDragOver(event)).not.toThrow();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe('drop', () => {
  it('hands the extracted files to the caller with this folder as the target', async () => {
    const extracted = {
      individualFiles: [new File([], 'a.txt')],
      folderStructures: [],
      skipped: [],
    };
    processItems.mockResolvedValue(extracted);
    const { result, onFilesDropped } = mount();

    await act(async () => result.current.dragHandlers.onDrop(dragEvent()));

    expect(onFilesDropped).toHaveBeenCalledExactlyOnceWith(extracted, target);
  });

  it('keeps the drop from reaching the listing behind it', async () => {
    const { result } = mount();
    const event = dragEvent();

    await act(async () => result.current.dragHandlers.onDrop(event));

    // The listing uploads to the current prefix. Letting the drop through as
    // well is what put files beside the folder they were aimed at.
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('stops the propagation before awaiting the extraction', async () => {
    // Extraction walks the dropped tree and can take a while. stopPropagation
    // after the await would run in a later task, long after the event finished
    // bubbling and the listing already took the drop.
    let release!: (v: ProcessedDragData) => void;
    processItems.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const { result } = mount();
    const event = dragEvent();

    const dropping = result.current.dragHandlers.onDrop(event);

    expect(event.stopPropagation).toHaveBeenCalled();

    release({ individualFiles: [], folderStructures: [], skipped: [] });
    await act(async () => {
      await dropping;
    });
  });

  it('ignores a drag that carries no files', async () => {
    const { result, onFilesDropped } = mount();
    const event = dragEvent(['text/plain']);

    await act(async () => result.current.dragHandlers.onDrop(event));

    expect(processItems).not.toHaveBeenCalled();
    expect(onFilesDropped).not.toHaveBeenCalled();
    // Left uncancelled, so whatever the drag really was still gets its drop.
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it('ignores a drop carrying no dataTransfer', async () => {
    const { result, onFilesDropped } = mount();

    await act(async () => result.current.dragHandlers.onDrop(dragEvent(null)));

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

  it('survives the row unmounting while extraction is still running', async () => {
    // Drop onto a folder, navigate away, and the walk is still going.
    // Everything the continuation touches lives above this component, so there
    // is no setState on an unmounted one. React 19 would not warn either way,
    // which is exactly why this is worth asserting rather than assuming.
    let release!: (v: ProcessedDragData) => void;
    processItems.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const { result, unmount, onFilesDropped } = mount();

    const dropping = result.current.dragHandlers.onDrop(dragEvent());
    unmount();
    release({ individualFiles: [new File([], 'a.txt')], folderStructures: [], skipped: [] });
    await act(async () => {
      await dropping;
    });

    // The upload still starts: the user asked for it before navigating away.
    expect(onFilesDropped).toHaveBeenCalledOnce();
  });

  it('forwards an empty extraction rather than swallowing it', async () => {
    processItems.mockResolvedValue({ individualFiles: [], folderStructures: [], skipped: [] });
    const { result, onFilesDropped } = mount();

    await act(async () => result.current.dragHandlers.onDrop(dragEvent()));

    // Dropping something that yields nothing is the caller's call to report.
    expect(onFilesDropped).toHaveBeenCalledOnce();
  });
});

describe('highlight', () => {
  it('marks itself when the provider names this folder', () => {
    context.hoveredTargetId = 'folder-f1';

    const { result } = mount();

    expect(result.current.isDropTarget).toBe(true);
  });

  it('stays unmarked while another folder is hovered', () => {
    context.hoveredTargetId = 'folder-other';

    const { result } = mount();

    // Exactly one folder is ever the target, so a row has only to recognise
    // its own id rather than track the pointer itself.
    expect(result.current.isDropTarget).toBe(false);
  });

  it('stays unmarked with no drag in progress', () => {
    const { result } = mount();

    expect(result.current.isDropTarget).toBe(false);
  });
});

describe('a folder with nowhere to put a drop', () => {
  const mountUnhandled = () => renderHook(() => useFolderDropTarget({ folder }));

  it('does not mark itself as a target', () => {
    const { result } = mountUnhandled();

    // Unmarked, so the provider's hit-test walks past to the listing behind.
    expect(result.current.dragHandlers[DROP_TARGET_ATTRIBUTE]).toBeUndefined();
  });

  it('lets a drop fall through to the listing', async () => {
    const { result } = mountUnhandled();
    const event = dragEvent();

    await act(async () => result.current.dragHandlers.onDrop(event));

    // Claiming it stops the listing from ever seeing it. Doing that and then
    // discarding it - what a no-op handler amounted to - lost the files.
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(processItems).not.toHaveBeenCalled();
  });

  it('does not claim the dragover either', () => {
    const { result } = mountUnhandled();
    const event = dragEvent();

    result.current.dragHandlers.onDragOver(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('never highlights, even when named as the hovered target', () => {
    context.hoveredTargetId = 'folder-f1';

    const { result } = mountUnhandled();

    // Promising a drop it cannot take.
    expect(result.current.isDropTarget).toBe(false);
  });
});
