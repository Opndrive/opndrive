import { _Object, CommonPrefix } from '@aws-sdk/client-s3';
import type React from 'react';

export interface FolderLocation {
  type: 'my-drive' | 'shared-with-me' | 'recent' | 'starred';
  label: string;
}

export interface Folder extends CommonPrefix {
  id: string;
  /**
   * Which shape this was built as, stated rather than inferred.
   *
   * `Prefix` is optional on CommonPrefix, so a folder that arrives without one
   * used to be indistinguishable from a file - there was nothing left to test.
   * Set by every factory that produces a Folder.
   *
   * Optional only so that anything constructed before this existed, or already
   * sitting in a cache, still type-checks. The guards in `shared/utils/drive-item`
   * read it first and fall back to the structural test when it is absent.
   */
  kind?: 'folder';
  name: string;
  location: FolderLocation;
  icon?: 'folder';
  itemCount?: number;
  lastModified?: Date;
  owner?: string;
}

export interface FolderMenuAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  onClick: (folder: Folder) => void;
}

export interface FolderSelectionState {
  selectedFolders: Set<string>;
  isSelecting: boolean;
}

export interface SuggestedFoldersProps {
  folders: Folder[];
  selectedFolders?: Set<string>;
  onFolderClick?: (folder: Folder) => void;
  onFolderSelect?: (folder: Folder, isSelected: boolean) => void;
  onFolderMenuClick?: (folder: Folder, event: React.MouseEvent) => void;
  className?: string;
}

export interface SelectionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  actions: FolderMenuAction[];
  className?: string;
}
