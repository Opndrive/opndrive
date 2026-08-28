import { _Object } from '@aws-sdk/client-s3';
import type React from 'react';
import { FileExtension } from '@/config/file-extensions';

export type DataUnits = 'B' | 'KB' | 'MB' | 'GB' | 'TB';

export interface FileItem extends _Object {
  id: string;
  /**
   * Which shape this was built as, stated rather than inferred.
   *
   * Note what this does NOT say: a zero-byte object whose key ends in a slash
   * is a folder to the person looking at it, and it is built by the same
   * factory as any other object, so it carries `kind: 'file'` too. The tag
   * records the shape; `isFile` and `isFolderLike` in `shared/utils/drive-item`
   * answer what it means, and they treat that case as a folder.
   *
   * Optional only so that anything constructed before this existed, or already
   * sitting in a cache, still type-checks.
   */
  kind?: 'file';
  name: string;
  extension: string;
  size: {
    value: number;
    unit: DataUnits;
  };
  lastModified?: Date;
  lastOpened?: Date;
  owner?: { id: string; name: string; email: string; avatar?: string };
  location?: { type: 'my-drive' | 'shared-with-me' | 'folder'; path: string; folderId?: string };
  isShared?: boolean;
  reasonSuggested?: string;
  thumbnail?: string;
}

// Re-export FileExtension from centralized config
export type { FileExtension };

export type ViewLayout = 'grid' | 'list';

export interface FileMenuAction {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  hasSubmenu?: boolean;
  onClick?: (file: FileItem) => void;
}
