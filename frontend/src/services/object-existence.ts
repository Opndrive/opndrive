import { BYOS3ApiProvider } from '@opndrive/s3-api';

/**
 * Whether a single object already exists at `key`.
 *
 * The sibling of `folderExists`, and deliberately shaped the same way: it does
 * NOT catch. The version this replaces lived inside the upload store and did
 *
 *     try { ... } catch { return false; }
 *
 * so a HEAD that failed for any reason - throttling, a dropped connection, a
 * permissions gap - was read as "nothing is there" and the upload silently
 * overwrote whatever was. Callers that cannot determine the answer must say so
 * rather than guess.
 *
 * @throws whatever the metadata lookup threw.
 */
export async function objectExists(apiS3: BYOS3ApiProvider, key: string): Promise<boolean> {
  const metadata = await apiS3.fetchMetadata(key);
  return metadata !== null;
}

/** Joins a destination prefix and a file name into an S3 key. */
export function objectKey(prefix: string, fileName: string): string {
  let clean = prefix ?? '';
  if (clean.startsWith('/')) clean = clean.slice(1);
  if (!clean || clean === '/') return fileName;
  if (!clean.endsWith('/')) clean = `${clean}/`;
  return `${clean}${fileName}`;
}
