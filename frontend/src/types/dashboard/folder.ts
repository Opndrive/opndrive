import type React from "react"

export interface FolderLocation {
  type: "my-drive" | "shared-with-me" | "recent" | "starred"
  label: string
}

export interface Folder {
  id: string
  name: string
  location: FolderLocation
  icon?: "folder" | "shared-folder" | "folder-shared"
  itemCount?: number
  lastModified?: Date
  owner?: string
}

export interface FolderMenuAction {
  id: string
  label: string
  icon?: React.ReactNode
  shortcut?: string
  variant?: "default" | "destructive"
  disabled?: boolean
  onClick: (folder: Folder) => void
}

export interface FolderSelectionState {
  selectedFolders: Set<string>
  isSelecting: boolean
}

export interface SuggestedFoldersProps {
  folders: Folder[]
  selectedFolders?: Set<string>
  onFolderClick?: (folder: Folder) => void
  onFolderSelect?: (folder: Folder, isSelected: boolean) => void
  onFolderMenuClick?: (folder: Folder, event: React.MouseEvent) => void
  className?: string
}

export interface SelectionBarProps {
  selectedCount: number
  onClearSelection: () => void
  actions: FolderMenuAction[]
  className?: string
}
