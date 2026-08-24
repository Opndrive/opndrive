'use client';

import React from 'react';
import type { FileItem, FileMenuAction } from '@/features/dashboard/types/file';
import { Download, Edit3, Info, Trash2, Eye, Share, ExternalLink } from 'lucide-react';
import { useDownloadActions, useIsFileDownloading } from '@/features/dashboard/hooks/use-download';
import { useDeleteWithProgress } from '@/features/dashboard/hooks/use-delete-with-progress';
import { useRename } from '@/context/rename-context';
import { useDetails } from '@/context/details-context';
import { useFilePreview } from '@/context/file-preview-context';
import { openPreviewInNewTab } from '@/lib/preview-url';
import { useDriveStore } from '@/context/data-context';
import { useShare } from '@/context/share-context';
import { getFileExtensionWithoutDot } from '@/config/file-extensions';
import { AriaLabel } from '@/shared/components/custom-aria-label';
import { confirmAction } from '@/shared/components/ui/confirm-dialog';
import { MdOpenWith } from 'react-icons/md';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { menuContentClass, menuItemClass } from './menu-styles';

interface FileOverflowMenuProps {
  file: FileItem;
  allFiles?: FileItem[];
  /**
   * The button that opens the menu, rendered as the trigger itself. The menu
   * used to be positioned by hand against an `anchorElement` prop; Radix does
   * that now, including keeping it on screen near the edges.
   */
  trigger: React.ReactNode;
  /** Tooltip for the trigger. Omit to render the trigger without one. */
  triggerLabel?: string;
  className?: string;
  additionalActions?: FileMenuAction[];
  insertAdditionalActionsAfter?: string;
  onOpenChange?: (open: boolean) => void;
}

export const FileOverflowMenu: React.FC<FileOverflowMenuProps> = ({
  file,
  allFiles = [],
  trigger,
  triggerLabel,
  className = '',
  additionalActions = [],
  insertAdditionalActionsAfter = 'open',
  onOpenChange,
}) => {
  const { downloadFile } = useDownloadActions();
  const isDownloading = useIsFileDownloading(file.id);
  const { isRenaming, showRenameDialog: openRenameDialog } = useRename();
  const { open: openDetails } = useDetails();
  const { openPreview } = useFilePreview();
  const currentPrefix = useDriveStore((state) => state.currentPrefix);
  const { openShareDialog } = useShare();
  const { deleteFile, isDeleting } = useDeleteWithProgress();

  const handlePreview = () => {
    const toPreviewable = (item: FileItem) => ({
      id: item.id,
      name: item.name,
      key: item.Key,
      size: typeof item.Size === 'number' ? item.Size : 0,
      lastModified: item.lastModified,
      type: item.extension || getFileExtensionWithoutDot(item.name),
    });

    const previewableFile = toPreviewable(file);
    const previewableFiles = allFiles.map(toPreviewable);

    openPreview(
      previewableFile,
      previewableFiles.length > 0 ? previewableFiles : [previewableFile]
    );
  };

  const handleOpenInNewTab = () => {
    // The key is enough now. It used to need the ETag as well, for a preview
    // route that pinned the file version and refused to load once it changed.
    const key = file.Key || '';

    if (!key) {
      console.error('Missing Key for file preview');
      return;
    }

    openPreviewInNewTab({ key });
  };

  // Actions other than "Open with", which is a submenu rather than a row.
  const actions = React.useMemo(() => {
    // Built inside the memo so React can see what it actually depends on. As a
    // hoisted helper its live reads - download/rename/delete `disabled` - were
    // invisible to the dependency array, so those states stayed stale until an
    // unrelated prop happened to change.
    const defaultActions: FileMenuAction[] = [
      {
        id: 'download',
        label: 'Download',
        icon: Download,
        disabled: isDownloading,
        onClick: (item) => {
          setTimeout(() => downloadFile(item), 0);
        },
      },
      {
        id: 'share',
        label: 'Share',
        icon: Share,
        onClick: () => openShareDialog(file),
      },
      {
        id: 'rename',
        label: 'Rename',
        icon: Edit3,
        disabled: isRenaming(file.id || file.Key || file.name),
        onClick: () => openRenameDialog(file, 'file', currentPrefix || ''),
      },
      {
        id: 'info',
        label: 'File information',
        icon: Info,
        onClick: () => openDetails(file),
      },
      {
        id: 'delete',
        label: isDeleting(file.id || file.Key || file.name) ? 'Deleting...' : 'Delete forever',
        icon: Trash2,
        variant: 'destructive' as const,
        disabled: isDeleting(file.id || file.Key || file.name),
        onClick: async () => {
          const confirmDelete = await confirmAction({
            title: 'Delete forever?',
            description: `"${file.name}" will be deleted forever. This action cannot be undone.`,
            confirmLabel: 'Delete forever',
            destructive: true,
          });

          if (confirmDelete) {
            try {
              await deleteFile(file);
            } catch (error) {
              console.error('Delete failed:', error);
            }
          }
        },
      },
    ];

    if (additionalActions.length === 0) {
      return defaultActions;
    }

    // 'open' is the submenu, which always sits first, so extra actions asking to
    // follow it belong at the top of this list.
    if (insertAdditionalActionsAfter === 'open') {
      return [...additionalActions, ...defaultActions];
    }

    const insertIndex = defaultActions.findIndex(
      (action) => action.id === insertAdditionalActionsAfter
    );

    if (insertIndex === -1) {
      return [...additionalActions, ...defaultActions];
    }

    return [
      ...defaultActions.slice(0, insertIndex + 1),
      ...additionalActions,
      ...defaultActions.slice(insertIndex + 1),
    ];
  }, [
    file,
    additionalActions,
    insertAdditionalActionsAfter,
    isDownloading,
    downloadFile,
    openShareDialog,
    isRenaming,
    openRenameDialog,
    currentPrefix,
    openDetails,
    isDeleting,
    deleteFile,
  ]);

  const triggerNode = <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>;

  return (
    // modal={false}: a dropdown should not freeze the whole page. This menu used
    // to set document.body.style.overflow itself, which is half of the scroll
    // locking mess in #86.
    <DropdownMenu modal={false} onOpenChange={onOpenChange}>
      {triggerLabel ? (
        <AriaLabel label={triggerLabel} position="top">
          {triggerNode}
        </AriaLabel>
      ) : (
        triggerNode
      )}

      {/* Beside the button rather than under it, since dropping below covers
          the rows underneath along with their own menu buttons.

          Asks for the right and lets Radix flip it to the left when there is no
          room, which is what the hand-rolled version worked out by hand: it
          tried `rect.right + padding` first and only used
          `rect.left - menuWidth - padding` when that ran off screen.
          `align="start"` lines the top up with the button, and Radix nudges it
          up or down to keep it in view. */}
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={8}
        className={`${menuContentClass} ${className}`}
        aria-label={`Actions for ${file.name}`}
      >
        {/* Was hover-only, so Preview had no keyboard path at all. As a Radix
            submenu it opens on Enter or ArrowRight and closes on ArrowLeft. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={menuItemClass}>
            <MdOpenWith className="h-4 w-4 shrink-0" />
            <span className="flex-1">Open with</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={menuContentClass}>
            <DropdownMenuItem className={menuItemClass} onSelect={handlePreview}>
              <Eye className="h-4 w-4 shrink-0" />
              <span className="flex-1">Preview</span>
            </DropdownMenuItem>
            <DropdownMenuItem className={menuItemClass} onSelect={handleOpenInNewTab}>
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="flex-1">Open in new tab</span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {actions.map((action, index) => (
          <React.Fragment key={action.id}>
            {index === actions.length - 1 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className={menuItemClass}
              variant={action.variant === 'destructive' ? 'destructive' : 'default'}
              disabled={action.disabled}
              onSelect={() => action.onClick?.(file)}
            >
              <action.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{action.label}</span>
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
