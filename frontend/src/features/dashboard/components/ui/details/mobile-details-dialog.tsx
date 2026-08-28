'use client';

import { X } from 'lucide-react';
import { useDetails } from '@/context/details-context';
import { useFileMetadata } from '@/features/dashboard/hooks/use-file-metadata';
import { FileItem } from '@/features/dashboard/types/file';
import { FaFolder } from 'react-icons/fa';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { isFile } from '@/shared/utils/drive-item';

/**
 * Something this panel can actually describe.
 *
 * The old test also accepted anything carrying a `name`, which every folder
 * does - so a folder marker reached the metadata fetch and was rendered as an
 * ordinary file. `isFile` excludes keys ending in a slash, which is the only
 * thing separating a marker from a file.
 */
const isFileItem = (item: FileItem | null): item is FileItem => isFile(item);

export const MobileDetailsDialog = () => {
  const { isOpen, selectedItem, close } = useDetails();
  const { metadata, isLoading } = useFileMetadata(isFileItem(selectedItem) ? selectedItem : null);

  if (!selectedItem) return null;

  const isFile = isFileItem(selectedItem);
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
    // Had the dialog role and aria-modal already, but nothing trapped focus or
    // gave it back on close. Radix supplies both, plus Escape and the scroll
    // lock, so the hand-rolled backdrop and portal go with it.
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/50 backdrop-blur-sm"
        className="w-full max-w-md gap-0 rounded-2xl border border-border bg-background p-0 shadow-xl max-h-[90vh] overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b border-border">
          <DialogTitle className="text-lg font-semibold text-foreground">
            {isFile ? file?.name : 'Unknown'}
          </DialogTitle>
          <AriaLabel label="Close details panel" position="top">
            <DialogClose className="p-2 rounded-full cursor-pointer hover:bg-muted transition-colors">
              <X className="h-5 w-5 text-foreground" />
            </DialogClose>
          </AriaLabel>
        </div>

        {/* Radix warns without one, and a screen reader otherwise gets the
            file name and then an unannounced wall of properties. */}
        <DialogDescription className="sr-only">
          Details for {isFile ? file?.name : 'this item'}.
        </DialogDescription>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] custom-scrollbar">
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-medium text-foreground mb-1">
                {isFile ? file?.name : 'Unknown'}
              </h3>
              <p className="text-sm text-muted-foreground">File details</p>
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
                    {isFile && file ? getFileTypeDisplay(file) : 'Unknown'}
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
                    {formatDate(metadata?.created || null)}
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
      </DialogContent>
    </Dialog>
  );
};
