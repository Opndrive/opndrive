/**
 * The largest source a picture offers: its `srcset` entry with the widest
 * descriptor, or what it is showing now. The lightbox wants the most detail
 * there is, not the size picked for a column.
 *
 * Kept apart from the lightbox so reading it does not load the dialog.
 */
export function largestSource(img: HTMLImageElement): string {
  let best = img.currentSrc || img.src;
  let bestWidth = 0;
  for (const candidate of (img.getAttribute('srcset') ?? '').split(',')) {
    const [url, descriptor] = candidate.trim().split(/\s+/);
    const width = descriptor?.endsWith('w') ? Number.parseInt(descriptor, 10) : 0;
    if (url && width > bestWidth) {
      best = url;
      bestWidth = width;
    }
  }
  return best;
}
