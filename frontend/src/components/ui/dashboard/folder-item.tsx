"use client"

import type React from "react"
import { useState } from "react"
import type { Folder } from "@/types/dashboard/folder"
import { FolderIcon, SharedFolderIcon, MoreVerticalIcon } from "@/components/icons/folder-icons"
import { OverflowMenu } from "./overflow-menu"

interface FolderItemProps {
  folder: Folder
  onClick?: (folder: Folder) => void
  onMenuClick?: (folder: Folder, event: React.MouseEvent) => void
  className?: string
}

const getFolderIcon = (folder: Folder) => {
  if (folder.location.type === "shared-with-me") {
    return <SharedFolderIcon className="text-blue-400" size={20} />
  }
  return <FolderIcon className="text-blue-400" size={20} />
}

export const FolderItem: React.FC<FolderItemProps> = ({ folder, onClick, onMenuClick, className = "" }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  const handleClick = () => {
    onClick?.(folder)
  }

  const handleMenuClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    setMenuAnchor(event.currentTarget as HTMLElement)
    setIsMenuOpen(true)
    onMenuClick?.(folder, event)
  }

  const handleMenuClose = () => {
    setIsMenuOpen(false)
    setMenuAnchor(null)
  }

  return (
    <>
      <div
        className={`
          group flex items-center gap-3 p-3 rounded-lg
          transition-all duration-200 cursor-pointer
          bg-secondary 
          hover:bg-secondary/80
          ${className}
        `}
        onClick={handleClick}
      >
        <div className="flex-shrink-0">{getFolderIcon(folder)}</div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground truncate">{folder.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{folder.location.label}</p>
        </div>

        <button
          className="
            flex-shrink-0 p-1 rounded-full
            hover:bg-card transition-all duration-200
            text-muted-foreground hover:text-foreground
          "
          onClick={handleMenuClick}
          aria-label={`More options for ${folder.name}`}
        >
          <MoreVerticalIcon size={16} />
        </button>
      </div>

      <OverflowMenu folder={folder} isOpen={isMenuOpen} onClose={handleMenuClose} anchorElement={menuAnchor} />
    </>
  )
}
