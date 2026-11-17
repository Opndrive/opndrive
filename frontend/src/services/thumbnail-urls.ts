import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import { getContentTypeForS3 } from '@/config/file-extensions';

/**
 * How long a thumbnail URL is signed for, and so how long the browser may
 * keep the image it fetched.
 */
const URL_LIFETIME_SECONDS = 60 * 60;

/**
 * A URL this close to expiring is replaced rather than handed out, so an image
 * never starts loading on a signature that is about to stop working.
 */
const RENEW_BEFORE_MS = 5 * 60 * 1000;

/** Past this many URLs, expired ones are swept out when another is added. */
const SWEEP_ABOVE = 1_000;

interface CachedUrl {
  url: Promise<string>;
  expiresAt: number;
}

/**
 * One set of URLs per provider. A new session or a bucket switch builds a
 * new provider, and the old one's URLs are not ours to hand out any more.
 */
const cache = new WeakMap<BYOS3ApiProvider, Map<string, CachedUrl>>();

/**
 * A presigned URL for showing an object as a thumbnail, the same one each time
 * for as long as it lasts.
 *
 * Every thumbnail used to sign a URL of its own whenever it mounted. A
 * presigned URL carries the time it was signed, so each was a URL the browser
 * had never seen, its cache never matched, and scrolling a grid or coming back
 * to a folder downloaded every image in it again. Handing out the same URL
 * lets the browser keep the image, and the response says it may for as long
 * as the URL is valid, since most objects are stored with no Cache-Control.
 *
 * @param object.version tells two versions of an object at the same key
 * apart, so a replaced image is fetched anew: its ETag, or failing that when
 * it was last modified.
 */
export function thumbnailUrlFor(
  apiS3: BYOS3ApiProvider,
  object: { key: string; version?: string },
  now: number = Date.now()
): Promise<string> {
  let urls = cache.get(apiS3);
  if (!urls) {
    urls = new Map();
    cache.set(apiS3, urls);
  }

  const id = `${object.key}\u0000${object.version ?? ''}`;
  const cached = urls.get(id);
  if (cached && cached.expiresAt - RENEW_BEFORE_MS > now) return cached.url;

  if (urls.size > SWEEP_ABOVE) {
    for (const [other, entry] of urls) if (entry.expiresAt <= now) urls.delete(other);
  }

  const url = apiS3.getSignedUrl({
    key: object.key,
    expiryInSeconds: URL_LIFETIME_SECONDS,
    isPreview: true,
    responseContentType: getContentTypeForS3(object.key),
    responseCacheControl: `private, max-age=${URL_LIFETIME_SECONDS}`,
  });
  const entry: CachedUrl = { url, expiresAt: now + URL_LIFETIME_SECONDS * 1000 };
  urls.set(id, entry);

  // A signing that failed is not remembered, so the next thumbnail tries again.
  const owned = urls;
  url.catch(() => {
    if (owned.get(id) === entry) owned.delete(id);
  });

  return url;
}
