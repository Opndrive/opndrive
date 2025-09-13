'use client';

import { X } from 'lucide-react';
import { Button } from '@/shared/components/ui';
import { useDetails } from '@/context/details-context';
import { useFileMetadata } from '@/features/dashboard/hooks/use-file-metadata';
import { FileItem } from '@/features/dashboard/types/file';
import { FaFolder } from 'react-icons/fa';
import Image from 'next/image';
import { assets } from '@/assets';

const isFileItem = (item: FileItem | null): item is FileItem => {
  if (!item) return false;
  return ('Key' in item && !!item.Key) || ('name' in item && !!item.name);
};

export const DetailsSidebar = () => {
  const { close, selectedItem } = useDetails();
  const { metadata, isLoading, error } = useFileMetadata(
    isFileItem(selectedItem) ? selectedItem : null
  );

  const isFile = selectedItem && isFileItem(selectedItem);
  const hasData = isFile;

  const file = isFile ? (selectedItem as FileItem) : null;

  const formatDate = (date: Date | null) => {
    if (!date) return 'Unknown';
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  };

  const getLocation = (_item: FileItem) => {
    if (isFile && file) {
      // Extract path from file key
      const path = file.Key || '';
      const parts = path.split('/').slice(0, -1); // Remove filename
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

  return (
    <aside className="flex w-full h-full flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/20 rounded-t-2xl lg:rounded-t-3xl">
        <h4 className="text-lg font-medium text-foreground">Details</h4>
        <Button variant="sheet" size="icon" onClick={close}>
          <X className="h-5 w-5 text-foreground" />
        </Button>
      </header>

      {!hasData ? (
        <div className="mt-16 p-4 custom-scrollbar flex flex-col items-center justify-center">
          <Image
            src={assets.viewDetail.src}
            alt="Placeholder-view-details"
            width={175}
            height={175}
            priority
          />
          <p className="text-sm text-foreground text-center">No Details Found</p>
        </div>
      ) : (
        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
          <div className="space-y-6">
            <div className="text-center border-b border-border/20 pb-4">
              <h3 className="text-lg font-medium text-foreground mb-1 break-words">
                {isFile ? file?.name : 'Unknown'}
              </h3>
              <p className="text-sm text-muted-foreground">File details</p>
            </div>

            {isFile && isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                    <div className="h-4 bg-muted rounded animate-pulse w-full" />
                  </div>
                ))}
              </div>
            ) : isFile && error ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Failed to load file details</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Type
                  </label>
                  <p className="text-sm text-foreground mt-1">
                    {isFile && file ? getFileTypeDisplay(file) : 'Unknown'}
                  </p>
                </div>

                {isFile && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Size
                      </label>
                      <p className="text-sm text-foreground mt-1">{metadata?.size || 'Unknown'}</p>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Storage used
                      </label>
                      <p className="text-sm text-foreground mt-1">{metadata?.size || 'Unknown'}</p>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Location
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <FaFolder className="w-4 h-4 text-primary" />
                    <span className="text-sm text-foreground">{getLocation(selectedItem)}</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Last opened
                  </label>
                  <p className="text-sm text-foreground mt-1">
                    {isFile ? formatDate(metadata?.lastModified || null) : 'Never'}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Created
                  </label>
                  <p className="text-sm text-foreground mt-1">
                    {formatDate(metadata?.created || null)}
                  </p>
                </div>

                {isFile && metadata?.contentType && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Content Type
                    </label>
                    <p className="text-sm text-foreground mt-1 break-all">{metadata.contentType}</p>
                  </div>
                )}

                {isFile && metadata?.etag && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      ETag
                    </label>
                    <p className="text-sm text-foreground mt-1 break-all font-mono">
                      {metadata.etag}
                    </p>
                  </div>
                )}

                {isFile && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Storage Class
                    </label>
                    <p className="text-sm text-foreground mt-1">
                      {metadata?.storageClass || 'Standard'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
