"use client"

import type React from "react"
import { useState } from "react"
import type { Folder } from "@/types/dashboard/folder"
import { FolderItem } from "@/components/ui/dashboard/folder-item"

interface SuggestedFoldersProps {
  folders: Folder[]
  onFolderClick?: (folder: Folder) => void
  onFolderMenuClick?: (folder: Folder, event: React.MouseEvent) => void
  className?: string
}

export const SuggestedFolders: React.FC<SuggestedFoldersProps> = ({
  folders,
  onFolderClick,
  onFolderMenuClick,
  className = "",
}) => {
  const [isExpanded, setIsExpanded] = useState(true)

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded)
  }

  if (folders.length === 0) {
    return null
  }

  return (
    <div className={`w-full ${className}`}>
      <button
        className="
          flex items-center gap-2 w-full p-2 mb-3
          text-sm font-medium text-foreground
          hover:bg-secondary/80 rounded-lg
          transition-colors duration-200
        "
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
        aria-controls="suggested-folders-content"
      >
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-90" : "rotate-0"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Suggested folders
      </button>

      {isExpanded && (
        <div
          id="suggested-folders-content"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        >
          {folders.map((folder) => (
            <FolderItem key={folder.id} folder={folder} onClick={onFolderClick} onMenuClick={onFolderMenuClick} />
          ))}
        </div>
      )}
    </div>
  )
}
