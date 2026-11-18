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
 * Not catching here was only half of it. This went through `fetchMetadata`,
 * which does the catching itself and hands back null for a failure exactly as
 * it does for a missing object - so the promise above was kept by this function
 * and broken one call further down. `apiS3.objectExists` treats a 404 as the
 * only "no" there is.
 *
 * @throws whatever the lookup threw, for anything other than a missing object.
 */
export async function objectExists(apiS3: BYOS3ApiProvider, key: string): Promise<boolean> {
  return apiS3.objectExists(key);
}

/** S3's page size for a listing, and the most a single page can hold. */
const LISTING_PAGE_SIZE = 1000;

/**
 * Which of `names` already exist as objects directly under `prefix`.
 *
 * One listing page answers for up to a thousand objects in a single round
 * trip, where checking each name needs a HEAD of its own. Dropping 500 files
 * used to mean 500 HEADs before the first byte moved.
 *
 * A folder can hold far more than is worth listing, though, so the listing
 * stops after `maxPages`. Finished by then, it answers for every name. Cut
 * short, it answers only for the names it found, and returns the rest as
 * `unknown` for the caller to check one by one. Absence is never inferred from
 * where the listing stopped: S3 lists in key order only for general purpose
 * buckets, and a name wrongly thought free is a file overwritten.
 *
 * @throws whatever the listing threw, like `objectExists`.
 */
export async function findExistingNames(
  apiS3: BYOS3ApiProvider,
  prefix: string,
  names: readonly string[],
  maxPages: number
): Promise<{ existing: Set<string>; unknown: string[] }> {
  const listPrefix = objectKey(prefix, '');
  const wanted = new Set(names);
  const existing = new Set<string>();

  let token: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const listing = await apiS3.fetchDirectoryStructure(listPrefix, LISTING_PAGE_SIZE, token);

    for (const object of listing.files) {
      const name = object.Key?.slice(listPrefix.length);
      if (name !== undefined && wanted.has(name)) existing.add(name);
    }

    // A page that says it is the last is the last, token or not: S3 sends a
    // token only with a truncated page, and asking with one it should not
    // have sent could only fail or go round again.
    if (listing.isTruncated === false) return { existing, unknown: [] };

    if (listing.nextToken) {
      token = listing.nextToken;
      continue;
    }

    // Truncated with no token to follow: there is more, and no way to read
    // it, so the listing is cut short here. S3 always sends the token, but a
    // service that does not has still said there is more, and read as
    // finished, every name past this page looked free.
    if (listing.isTruncated) break;

    // Neither flag nor token: nothing says there is more.
    return { existing, unknown: [] };
  }

  return { existing, unknown: names.filter((name) => !existing.has(name)) };
}

/** Joins a destination prefix and a file name into an S3 key. */
export function objectKey(prefix: string, fileName: string): string {
  let clean = prefix ?? '';
  if (clean.startsWith('/')) clean = clean.slice(1);
  if (!clean || clean === '/') return fileName;
  if (!clean.endsWith('/')) clean = `${clean}/`;
  return `${clean}${fileName}`;
}
