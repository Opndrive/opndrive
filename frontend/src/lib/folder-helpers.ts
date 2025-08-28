import type { Folder, FolderLocation } from "@/types/dashboard/folder"

export const createFolderLocation = (type: FolderLocation["type"], customLabel?: string): FolderLocation => {
  const defaultLabels: Record<FolderLocation["type"], string> = {
    "my-drive": "In My Drive",
    "shared-with-me": "In Shared with me",
    recent: "In Recent",
    starred: "In Starred",
  }

  return {
    type,
    label: customLabel || defaultLabels[type],
  }
}

export const createFolder = (
  id: string,
  name: string,
  locationType: FolderLocation["type"],
  options?: {
    customLocationLabel?: string
    icon?: Folder["icon"]
    itemCount?: number
    lastModified?: Date
    owner?: string
  },
): Folder => {
  return {
    id,
    name,
    location: createFolderLocation(locationType, options?.customLocationLabel),
    icon: options?.icon || "folder",
    itemCount: options?.itemCount,
    lastModified: options?.lastModified,
    owner: options?.owner,
  }
}

export const sortFoldersByName = (folders: Folder[]): Folder[] => {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name))
}

export const filterFoldersByLocation = (folders: Folder[], locationType: FolderLocation["type"]): Folder[] => {
  return folders.filter((folder) => folder.location.type === locationType)
}

export const searchFolders = (folders: Folder[], query: string): Folder[] => {
  const lowercaseQuery = query.toLowerCase().trim()
  if (!lowercaseQuery) return folders

  return folders.filter(
    (folder) =>
      folder.name.toLowerCase().includes(lowercaseQuery) ||
      folder.location.label.toLowerCase().includes(lowercaseQuery),
  )
}
