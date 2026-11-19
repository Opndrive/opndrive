/**
 * A few thumbnails load at a time; the rest wait their turn.
 *
 * Opening a grid, or flinging it to somewhere new, puts a screenful of image
 * cards on screen at once. Letting every one of them start a download competes
 * with the listing request the user is waiting on - browsers allow about six
 * connections to a host - and with each other, so the first image to finish is
 * later than it would be if fewer had started. Four at a time keeps a
 * connection or two free, and the images on screen arrive in order.
 *
 * A waiter that gives up - its card scrolled off or was removed - leaves the
 * queue without ever starting.
 */

export const MAX_LOADING_IMAGES = 4;

type Waiter = () => void;

let active = 0;
const waiting: Waiter[] = [];

/** How many images are loading now, and how many are waiting. For tests and measuring. */
export function imageSlotStats() {
  return { active, waiting: waiting.length };
}

/**
 * Asks for a slot. `onGranted` runs once one is free - straight away if one
 * is. Returns the release: call it when the image has loaded, failed, or is
 * no longer wanted. Releasing before the grant takes the waiter off the queue.
 */
export function requestImageSlot(onGranted: () => void): () => void {
  let granted = false;
  let done = false;

  const grant: Waiter = () => {
    granted = true;
    active += 1;
    onGranted();
  };

  if (active < MAX_LOADING_IMAGES) grant();
  else waiting.push(grant);

  return () => {
    if (done) return;
    done = true;

    if (!granted) {
      const index = waiting.indexOf(grant);
      if (index >= 0) waiting.splice(index, 1);
      return;
    }

    active -= 1;
    const next = waiting.shift();
    next?.();
  };
}

/** For tests: forget every slot and waiter. */
export function resetImageSlots() {
  active = 0;
  waiting.length = 0;
}
