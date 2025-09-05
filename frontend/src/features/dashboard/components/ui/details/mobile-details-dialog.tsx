'use client';

import { X } from 'lucide-react';
import { useDetails } from '@/context/details-context';
import { useFileMetadata } from '@/features/dashboard/hooks/use-file-metadata';
import { FileItem } from '@/features/dashboard/types/file';
import { Folder } from '@/features/dashboard/types/folder';
import { FaFolder } from 'react-icons/fa';
import { createPortal } from 'react-dom';
import { useEffect } from 'react';

const isFileItem = (item: FileItem | Folder | null): item is FileItem => {
  if (!item) return false;
  return ('Key' in item && !!item.Key) || ('name' in item && !!item.name && !('Prefix' in item));
};

const isFolderItem = (item: FileItem | Folder | null): item is Folder => {
  if (!item) return false;
  return 'Prefix' in item && !!item.Prefix && !('Key' in item);
};

export const MobileDetailsDialog = () => {
  const { isOpen, selectedItem, close } = useDetails();
  const { metadata, isLoading } = useFileMetadata(isFileItem(selectedItem) ? selectedItem : null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !selectedItem) return null;

  const isFile = isFileItem(selectedItem);
  const isFolder = isFolderItem(selectedItem);
  const file = isFile ? (selectedItem as FileItem) : null;
  const folder = isFolder ? (selectedItem as Folder) : null;

  const formatDate = (date: Date | null) => {
    if (!date) return 'Unknown';
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  };

  const getLocation = (_item: FileItem | Folder) => {
    if (isFile && file) {
      // Extract path from file key
      const path = file.Key || '';
      const parts = path.split('/').slice(0, -1); // Remove filename
      if (parts.length === 0) {
        return 'My Drive';
      }
      return 'My Drive > ' + parts.join(' > ');
    }

    if (isFolder && folder) {
      // Extract path from folder prefix
      const path = folder.Prefix || '';
      const parts = path
        .split('/')
        .filter((p) => p.length > 0)
        .slice(0, -1); // Remove current folder
      if (parts.length === 0) {
        return 'My Drive';
      }
      return 'My Drive > ' + parts.join(' > ');
    }

    return 'My Drive';
  };

  const getFileTypeDisplay = (file: FileItem) => {
    const ext = file.extension?.toLowerCase();

    const typeMap: Record<string, string> = {
      pdf: 'PDF Document',
      doc: 'Microsoft Word Document',
      docx: 'Microsoft Word Document',
      xls: 'Microsoft Excel Spreadsheet',
      xlsx: 'Microsoft Excel Spreadsheet',
      ppt: 'Microsoft PowerPoint Presentation',
      pptx: 'Microsoft PowerPoint Presentation',
      txt: 'Plain Text Document',
      jpg: 'JPEG Image',
      jpeg: 'JPEG Image',
      png: 'PNG Image',
      gif: 'GIF Image',
      mp4: 'MP4 Video',
      mp3: 'MP3 Audio',
      zip: 'ZIP Archive',
      rar: 'RAR Archive',
    };

    if (ext && typeMap[ext]) {
      return typeMap[ext];
    }

    if (ext) {
      return `${ext.toUpperCase()} File`;
    }

    return 'File';
  };

  const dialogContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="details-title"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-md bg-background border border-border rounded-2xl shadow-xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 id="details-title" className="text-lg font-semibold text-foreground">
            {isFile ? file?.name : isFolder ? folder?.name : 'Unknown'}
          </h2>
          <button
            onClick={close}
            className="p-2 rounded-full hover:bg-muted transition-colors"
            aria-label="Close details"
          >
            <X className="h-5 w-5 text-foreground" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] custom-scrollbar">
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-medium text-foreground mb-1">
                {isFile ? file?.name : isFolder ? folder?.name : 'Unknown'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isFile ? 'File details' : 'Folder details'}
              </p>
            </div>

            {isFile && isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 bg-muted rounded animate-pulse w-1/3" />
                    <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Type</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isFile && file ? getFileTypeDisplay(file) : isFolder ? 'Folder' : 'Unknown'}
                  </p>
                </div>

                {isFile && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-foreground">Size</label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {metadata?.size || 'Unknown'}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-foreground">Storage used</label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {metadata?.size || 'Unknown'}
                      </p>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-sm font-medium text-foreground">Location</label>
                  <div className="flex items-center gap-2 mt-1">
                    <FaFolder className="w-4 h-4 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {getLocation(selectedItem)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground">Last opened</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isFile ? formatDate(metadata?.lastModified || null) : 'Never'}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground">Created</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isFile
                      ? formatDate(metadata?.created || null)
                      : formatDate(folder?.lastModified || null)}
                  </p>
                </div>

                {isFile && metadata?.contentType && (
                  <div>
                    <label className="text-sm font-medium text-foreground">Content Type</label>
                    <p className="text-sm text-muted-foreground mt-1">{metadata.contentType}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(dialogContent, document.body) : null;
};
