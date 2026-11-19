import type { SkippedItem } from '../stores/use-upload-queue-store';

/** The skipped items in one folder, as the panel lists them. */
export interface SkippedFolder {
  /** Relative to the drop and ending in '/', or '' for the top of it. */
  folder: string;
  /** What is in it, by name: a skipped folder ends in '/'. */
  names: string[];
}

/**
 * The skipped items grouped by the folder they were in, folders in path order,
 * so a long list reads as "photos/raw/ - 12" rather than twelve full paths.
 */
export function groupByFolder(items: readonly SkippedItem[]): SkippedFolder[] {
  const groups = new Map<string, string[]>();

  for (const item of items) {
    const path = item.path.replace(/\/+$/, '');
    const cut = path.lastIndexOf('/') + 1;
    const folder = path.slice(0, cut);
    const name = path.slice(cut) + (item.kind === 'folder' ? '/' : '');

    const names = groups.get(folder);
    if (names) names.push(name);
    else groups.set(folder, [name]);
  }

  return [...groups]
    .map(([folder, names]) => ({ folder, names }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
}

/**
 * The list as plain text, one path a line, for the clipboard. Says so when the
 * notice stands for more than it kept.
 */
export function skippedListText(items: readonly SkippedItem[], count: number): string {
  const lines = items.map((item) =>
    item.kind === 'folder' ? `${item.path.replace(/\/+$/, '')}/` : item.path
  );
  const missing = count - items.length;
  if (missing > 0) lines.push(`... and ${missing} more not listed`);

  return lines.join('\n');
}
