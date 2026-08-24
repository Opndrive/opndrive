export interface FolderNavigationParams {
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}

/**
 * Generate URL for folder navigation with query parameters
 *
 * There used to be a `key` parameter alongside `prefix`, carrying the folder's
 * own name. It was never read for its value - the breadcrumb only tested
 * whether it existed - and every value it could hold is the last segment of the
 * prefix sitting beside it. So it duplicated data that is transmitted on every
 * navigation, for nothing, in an app whose whole privacy story is about keeping
 * user paths out of query strings.
 */
export function generateFolderUrl(params: FolderNavigationParams): string {
  const urlParams = new URLSearchParams();

  if (params.prefix) {
    urlParams.set('prefix', params.prefix);
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
 * Prefix of the folder holding this one, always ending in a slash.
 *
 * Empty for a top level folder, which is the root's own prefix. Works on full
 * S3 prefixes too, so "team/photos/2024/" gives back "team/photos/".
 */
export function getParentPrefix(prefix: string): string {
  const trimmed = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const lastSlash = trimmed.lastIndexOf('/');

  return lastSlash === -1 ? '' : trimmed.slice(0, lastSlash + 1);
}

/**
 * Build navigation URL for folder click
 */
export function buildFolderClickUrl(currentPrefix: string, folderName: string): string {
  const newPrefix =
    currentPrefix === '/' || currentPrefix === ''
      ? `${folderName}/`
      : `${currentPrefix}${folderName}/`;

  return generateFolderUrl({ prefix: newPrefix });
}

/**
 * Build navigation URL for breadcrumb click
 */
export function buildBreadcrumbClickUrl(pathSegments: string[], targetIndex: number): string {
  const targetSegments = pathSegments.slice(0, targetIndex + 1);
  const prefix = pathSegmentsToPrefix(targetSegments);

  return generateFolderUrl({ prefix });
}
