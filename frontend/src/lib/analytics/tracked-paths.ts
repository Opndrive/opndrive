/**
 * The only pages on this site that may send analytics: the home page, the blog
 * index and blog posts.
 *
 * An allowlist on purpose. The app (/connect, /dashboard), previews, the legal
 * pages and anything added later send nothing unless they are named here. The
 * sender checks this before every event, so a visitor who moves from a post
 * into the app inside one tab stops being counted at the door.
 */
const TRACKED_PATHS = [/^\/$/, /^\/blog\/?$/, /^\/blog\/[^/]+\/?$/];

export function isTrackedPath(pathname: string): boolean {
  return TRACKED_PATHS.some((pattern) => pattern.test(pathname));
}
