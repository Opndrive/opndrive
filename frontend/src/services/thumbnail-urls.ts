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

/**
 * The most URLs kept per provider. Making room lets the expired go, then the
 * least recently used, down to EVICT_TO.
 *
 * A bound, because nothing here expires for an hour: sweeping only expired
 * URLs let browsing a few big folders grow this by every image seen.
 */
export const MAX_CACHED_THUMBNAIL_URLS = 2_000;

/**
 * Where making room stops. Well under the limit, so it happens once for many
 * new images rather than walking the whole cache for each one, which is what
 * sweeping on every insert past a threshold did.
 */
const EVICT_TO = Math.floor(MAX_CACHED_THUMBNAIL_URLS * 0.9);

interface CachedUrl {
  url: Promise<string>;
  /** What `url` resolved to, once it has. What forgetThumbnailUrl matches. */
  signed?: string;
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

  const id = cacheId(object);
  const cached = urls.get(id);
  if (cached && cached.expiresAt - RENEW_BEFORE_MS > now) {
    // Moved to the end: a Map iterates in insertion order, so making room
    // takes the least recently used first.
    urls.delete(id);
    urls.set(id, cached);
    return cached.url;
  }

  // Replaced, if it was here: deleted first so the new one goes at the end.
  urls.delete(id);
  if (urls.size >= MAX_CACHED_THUMBNAIL_URLS) makeRoom(urls, now);

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
  url.then(
    (signed) => {
      entry.signed = signed;
    },
    () => {
      if (owned.get(id) === entry) owned.delete(id);
    }
  );

  return url;
}

/**
 * Lets go of a URL whose image would not load, so the next tile to ask for
 * the image is given a freshly signed one.
 *
 * A tile loads its image only when it is scrolled into view, which can be
 * long after it was handed the URL, and a URL handed out with minutes to
 * spare can have expired by then. Nothing replaced it: the tile showed its
 * icon, and every tile after it was handed the same dead URL until it aged
 * out of here too.
 *
 * Only that URL goes. If another tile has already replaced it, the
 * replacement stays.
 */
export function forgetThumbnailUrl(
  apiS3: BYOS3ApiProvider,
  object: { key: string; version?: string },
  url: string
): void {
  const urls = cache.get(apiS3);
  const id = cacheId(object);
  if (urls?.get(id)?.signed === url) urls.delete(id);
}

/** An image's place in the cache: its key, and which version of it. */
function cacheId(object: { key: string; version?: string }): string {
  return `${object.key}\u0000${object.version ?? ''}`;
}

/** The expired go first, then the least recently used, down to EVICT_TO. */
function makeRoom(urls: Map<string, CachedUrl>, now: number): void {
  for (const [id, entry] of urls) if (entry.expiresAt <= now) urls.delete(id);

  for (const id of urls.keys()) {
    if (urls.size <= EVICT_TO) break;
    urls.delete(id);
  }
}
