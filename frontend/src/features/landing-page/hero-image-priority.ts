/**
 * Makes the hero image the visitor will actually see load first, without
 * downloading the one they will not.
 *
 * The hero ships twice, light and dark, and CSS shows the one matching
 * `data-theme` (see .theme-light-only in globals.css). Both are lazy, because
 * an eager image downloads even when hidden - so marking either `priority`
 * fetched both. Lazy has its own cost: the visible copy, which is the page's
 * largest paint, waits for layout before it is even requested.
 *
 * The server cannot pick between them; the theme lives in localStorage or the
 * system setting. The inline script in the root layout reads both and stamps
 * `data-theme` before the body is parsed. This runs right after the two images
 * are parsed and promotes the matching one to eager with high fetch priority,
 * so its request starts during parsing. The other stays lazy and hidden, and
 * is never fetched.
 *
 * Attributes rather than properties, so the change is visible in the DOM and
 * to anything that reads it.
 */

/** Read by the script below; set on each copy of the hero image. */
export const HERO_THEME_ATTRIBUTE = 'data-hero-theme';

export const HERO_IMAGE_PRIORITY_SCRIPT = `(function () {
  try {
    var theme = document.documentElement.getAttribute('data-theme');
    if (theme !== 'dark' && theme !== 'light') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var image = document.querySelector('img[${HERO_THEME_ATTRIBUTE}="' + theme + '"]');
    if (image) {
      image.setAttribute('fetchpriority', 'high');
      image.setAttribute('loading', 'eager');
    }
  } catch (e) {
    // Leaves both images lazy, which still shows the right one.
  }
})();`;
