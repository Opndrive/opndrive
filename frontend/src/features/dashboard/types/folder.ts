import { _Object, CommonPrefix } from '@aws-sdk/client-s3';
import type React from 'react';

export interface FolderLocation {
  type: 'my-drive' | 'shared-with-me' | 'recent' | 'starred';
  label: string;
}

export interface Folder extends CommonPrefix {
  name: string;
  icon?: 'folder';
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
