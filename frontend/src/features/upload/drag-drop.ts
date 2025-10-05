/**
 * Upload Feature Exports
 *
 * Centralized exports for the upload feature including enhanced drag-and-drop functionality
 */

// Enhanced Drag & Drop System
export {
  EnhancedDragDropProvider,
  useEnhancedDragDrop,
} from './providers/enhanced-drag-drop-provider';
export { FolderDropTarget } from './components/folder-drop-target';

// Hooks
export { useFolderDropTarget } from './hooks/use-folder-drop-target';

// Types
export type {
  DragDropTarget,
  DragDropSource,
  DragDropContext,
  DragDropCallbacks,
} from './types/drag-drop-types';

// Re-export existing upload components
export { UploadCard } from './components/upload-card';
