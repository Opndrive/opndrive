/**
 * Drag and Drop Context Types
 *
 * Defines the different types of drag-and-drop interactions in the app
 */

export type DragDropTarget = {
  type: 'folder' | 'directory' | 'global';
  id: string;
  path: string;
  name: string;
};

export type DragDropItem = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path?: string;
  size?: number;
};

export type DragDropSource = {
  type: 'external-files' | 'internal-files' | 'internal-folders';
  items: DragDropItem[];
  count: number;
};

export type DragDropContext = {
  source: DragDropSource | null;
  target: DragDropTarget | null;
  isActive: boolean;
  canDrop: boolean;
};

export interface DragDropCallbacks {
  onFilesDroppedToDirectory?: (files: File[], folders: File[], targetPath: string) => void;
  onFilesDroppedToFolder?: (files: File[], folders: File[], targetFolder: DragDropTarget) => void;
  onInternalItemsDropped?: (items: DragDropItem[], target: DragDropTarget) => void;
}
