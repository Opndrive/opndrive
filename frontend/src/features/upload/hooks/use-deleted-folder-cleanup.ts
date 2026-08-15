'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useDriveStore } from '@/context/data-context';
import { generateFolderUrl, getParentPrefix } from '@/features/folder-navigation/folder-navigation';

/** The two routes that stand the user inside a folder. */
const FOLDER_VIEWS = ['/dashboard', '/dashboard/browse'];

/**
 * Tidies up after a folder that has been deleted from the bucket.
 *
 * The overflow menu deletes a folder from the listing it sits in, but the
 * recovery banner deletes one from wherever the reload happened to land, which
 * can be deep inside that same folder. The user is then standing somewhere that
 * no longer exists: the breadcrumb still spells out the path, walking back up
 * shows empty listings, and the folder is still offered at the top until the
 * page is reloaded by hand.
 *
 * So the cached listings go, and if the folder we were in went with them, we
 * step out to its parent.
 *
 * @returns true when the folder the app was pointing at is gone, so refreshing
 * that prefix would only fetch an empty listing.
 */
export function useDeletedFolderCleanup() {
  const router = useRouter();
  const pathname = usePathname();
  const removeDeletedFolder = useDriveStore((state) => state.removeDeletedFolder);

  return useCallback(
    (prefix: string): boolean => {
      const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;
      const { currentPrefix, rootPrefix } = useDriveStore.getState();

      removeDeletedFolder(normalized);

      // startsWith covers standing in the folder itself as well as any depth
      // below it, since both are gone now.
      if (!currentPrefix || !currentPrefix.startsWith(normalized)) return false;

      // Search shows folders from anywhere in the bucket while the store still
      // points at the last one browsed. Deleting from there is not standing in
      // it, and throwing the user out of their results would be its own bug.
      if (FOLDER_VIEWS.includes(pathname ?? '')) {
        // Cached prefixes are absolute, while the URL is relative to the prefix
        // the session is pinned to.
        const root = !rootPrefix || rootPrefix === '/' ? '' : rootPrefix;
        const parent = getParentPrefix(normalized);
        const relative = parent.startsWith(root) ? parent.slice(root.length) : parent;

        // replace, not push: a back button that walks into a deleted folder is
        // the same dead end we are getting out of.
        router.replace(generateFolderUrl({ prefix: relative }));
      }

      return true;
    },
    [removeDeletedFolder, router, pathname]
  );
}
