import { BYOS3ApiProvider } from '@opndrive/s3-api';

/**
 * Checks whether anything is stored under a folder prefix.
 *
 * This used to be copy-pasted into four call sites, each of which caught the
 * error and returned `false` - meaning "the name is free". A listing that
 * failed for any reason (permissions, throttling, a dropped connection) was
 * therefore read as "this folder does not exist", and the caller went on to
 * create, rename, or upload over something that was already there.
 *
 * So this deliberately does NOT catch. A caller that cannot determine whether
 * a name is taken must stop and say so, not guess. Use `describeFolderCheckError`
 * for the message to show the user.
 *
 * @throws whatever the S3 listing threw. Callers must handle it.
 */
export async function folderExists(
  apiS3: BYOS3ApiProvider,
  folderPrefix: string
): Promise<boolean> {
  const result = await apiS3.fetchDirectoryStructure(folderPrefix, 1);
  return result.files.length > 0 || result.folders.length > 0;
}

/**
 * Message for the case where we could not tell whether a name is taken.
 *
 * Deliberately does not claim the operation failed - we genuinely do not know
 * the state of the bucket, and saying "that folder already exists" would be a
 * guess presented as fact.
 */
export function describeFolderCheckError(action: string): string {
  return `Could not check whether that name is already taken, so ${action} was cancelled. Please try again.`;
}
