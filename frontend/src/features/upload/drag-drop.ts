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

// Utils
export {
  DROP_TARGET_ATTRIBUTE,
  dropTargetIdAt,
  folderTargetId,
  isExternalFileDrag,
} from './utils/drag-events';

// Types
export type { DragDropTarget } from './types/drag-drop-types';

// Re-export existing upload components
export { UploadCard } from './components/upload-card';
