/**
 * How long the uploads running now will take, worked out from what has really
 * been sent.
 *
 * The panel used to show a number that had nothing to do with the network: the
 * speed it averaged was invented (a random 0.5 to 2 MB/s every three seconds),
 * and upload cards carried no sizes, so it fell through to `(100 - progress) /
 * 15` minutes. A folder at 10% said "6 min left" on any connection, and then
 * counted down with the progress bar however long that took.
 *
 * Now the rate is measured: the bytes the files report having sent, over the
 * last stretch of time. When there is not enough to measure - just started,
 * paused, waiting for the network, or a file of unknown size - there is no
 * estimate at all, rather than a made-up one.
 */

/** What the meter reads off each upload card. */
export interface TimeLeftEntry {
  id: string;
  type: 'file' | 'folder';
  status: string;
  /** Percent, 0 to 100. */
  progress: number;
  size?: number;
}

/** Long enough to smooth over parts landing in bursts, short enough to follow a change of speed. */
const WINDOW_MS = 45_000;

/** How much has to have been watched before the rate means anything. */
const MIN_SPAN_MS = 10_000;

/** Still to send, as opposed to finished, failed or cancelled. */
const PENDING = new Set(['queued', 'uploading', 'paused']);

interface Sample {
  at: number;
  /** Every byte seen sent since the meter started, never decreasing. */
  sent: number;
}

export class TimeLeftMeter {
  /** Bytes each file had sent when last looked at. */
  private readonly seen = new Map<string, number>();
  private sent = 0;
  private samples: Sample[] = [];

  /**
   * Takes a reading of every upload card and returns the seconds left, or null
   * when there is no honest answer.
   */
  update(entries: Iterable<TimeLeftEntry>, now: number): number | null {
    let remaining = 0;
    let sizesKnown = true;
    let pending = 0;
    let paused = 0;

    for (const entry of entries) {
      // A folder card's progress is worked out from its files, which are
      // cards of their own; counting both would count every byte twice.
      if (entry.type !== 'file') continue;

      const size = entry.size;
      const progress = Math.min(100, Math.max(0, entry.progress || 0));

      if (PENDING.has(entry.status)) {
        pending += 1;
        if (entry.status === 'paused') paused += 1;
        if (size === undefined || size < 0) sizesKnown = false;
        else remaining += size * (1 - progress / 100);
      }

      if (size === undefined || size <= 0) continue;

      // Only growth counts. A file first seen part way through - the panel
      // opened mid-upload - sets a baseline instead of looking like a burst,
      // and one whose progress goes back to 0 on a retry is not negative speed.
      const bytes = (size * progress) / 100;
      const before = this.seen.get(entry.id);
      if (before !== undefined && bytes > before) this.sent += bytes - before;
      this.seen.set(entry.id, bytes);
    }

    // Nothing left to send, or all of it paused: start again from a clean
    // slate, so the idle stretch does not drag the next rate down.
    if (pending === 0 || paused === pending) {
      this.samples = [];
      if (pending === 0) this.seen.clear();
      return null;
    }

    this.samples.push({ at: now, sent: this.sent });
    while (this.samples.length > 2 && now - this.samples[1]!.at >= WINDOW_MS) {
      this.samples.shift();
    }

    // Whether anything is moving is read off the window, not off which status
    // a file happens to have at this instant: in a folder of small files a
    // reading often lands between one finishing and the next starting.
    if (!sizesKnown) return null;

    const rate = this.bytesPerSecond();
    if (rate === null) return null;

    return remaining / rate;
  }

  private bytesPerSecond(): number | null {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last) return null;

    const span = last.at - first.at;
    if (span < MIN_SPAN_MS) return null;

    const moved = last.sent - first.sent;
    if (moved <= 0) return null;

    return moved / (span / 1000);
  }
}

/**
 * "About 25 min left". Rounded harder the further out it is, because a
 * measured rate is good to a few minutes over an hour, not to the minute.
 */
export function formatTimeLeft(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return 'Less than a minute left';

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 10) return `About ${minutes} min left`;
  if (minutes < 60) {
    const rounded = Math.round(minutes / 5) * 5;
    return rounded >= 60 ? 'About 1 hr left' : `About ${rounded} min left`;
  }

  let hours = Math.floor(minutes / 60);
  let rest = Math.round((minutes % 60) / 10) * 10;
  if (rest === 60) {
    hours += 1;
    rest = 0;
  }

  return rest === 0 ? `About ${hours} hr left` : `About ${hours} hr ${rest} min left`;
}
