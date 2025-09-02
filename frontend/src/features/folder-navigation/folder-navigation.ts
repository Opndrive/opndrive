/**
 * Utility functions for folder navigation with enhanced routing
 */

export interface FolderNavigationParams {
  prefix?: string;
  key?: string;
  maxKeys?: number;
  continuationToken?: string;
}

/**
 * Generate URL for folder navigation with query parameters
 */
export function generateFolderUrl(params: FolderNavigationParams): string {
  const urlParams = new URLSearchParams();

  if (params.prefix) {
    urlParams.set('prefix', params.prefix);
  }

  if (params.key) {
    urlParams.set('key', params.key);
  }

  if (params.maxKeys) {
    urlParams.set('maxKeys', params.maxKeys.toString());
  }

  if (params.continuationToken) {
    urlParams.set('token', params.continuationToken);
  }

  return urlParams.toString() ? `/dashboard/browse?${urlParams.toString()}` : '/dashboard';
}

/**
 * Parse URL search parameters to folder navigation params
 */
export function parseFolderParams(searchParams: URLSearchParams): FolderNavigationParams {
  return {
    prefix: searchParams.get('prefix') || undefined,
    key: searchParams.get('key') || undefined,
    maxKeys: searchParams.get('maxKeys') ? parseInt(searchParams.get('maxKeys')!) : undefined,
    continuationToken: searchParams.get('token') || undefined,
  };
}

/**
 * Convert prefix to path segments for breadcrumb display
 */
export function prefixToPathSegments(prefix: string): string[] {
  return prefix.split('/').filter((segment) => segment.length > 0);
}

/**
 * Convert path segments to prefix
 */
export function pathSegmentsToPrefix(segments: string[]): string {
  return segments.length > 0 ? segments.join('/') + '/' : '';
}

/**
 * Get folder name from prefix (last segment)
 */
export function getFolderNameFromPrefix(prefix: string): string {
  const segments = prefixToPathSegments(prefix);
  return segments.length > 0 ? segments[segments.length - 1] : 'My Drive';
}

/**
 * Build navigation URL for folder click
 */
export function buildFolderClickUrl(
  currentPrefix: string,
  folderName: string,
  _currentKey?: string
): string {
  const newPrefix =
    currentPrefix === '/' || currentPrefix === ''
      ? `${folderName}/`
      : `${currentPrefix}${folderName}/`;

  return generateFolderUrl({
    prefix: newPrefix,
    key: folderName, // Use folder name as key as per backend requirement
  });
}

/**
 * Build navigation URL for breadcrumb click
 */
export function buildBreadcrumbClickUrl(pathSegments: string[], targetIndex: number): string {
  const targetSegments = pathSegments.slice(0, targetIndex + 1);
  const prefix = pathSegmentsToPrefix(targetSegments);
  const key = targetSegments.length > 0 ? targetSegments[targetSegments.length - 1] : undefined;

  return generateFolderUrl({ prefix, key });
}
