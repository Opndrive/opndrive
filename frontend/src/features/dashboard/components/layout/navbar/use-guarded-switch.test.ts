/**
 * The wording of "this will cancel your uploads", shared by both switchers and
 * the connect form. It is the whole of what someone reads before agreeing to
 * throw work away, so it has to count right.
 */

import { describe, expect, it } from 'vitest';
import { describeActiveWork, describeCancellation } from './use-guarded-switch';

describe('describeActiveWork', () => {
  it.each([
    [{ uploads: 1, deletes: 0 }, '1 upload is still in progress.'],
    [{ uploads: 2, deletes: 0 }, '2 uploads are still in progress.'],
    [{ uploads: 0, deletes: 1 }, '1 delete is still in progress.'],
    [{ uploads: 2, deletes: 1 }, '2 uploads and 1 delete are still in progress.'],
    [{ uploads: 0, deletes: 0 }, 'Work is still in progress.'],
  ])('%o reads "%s"', (work, text) => {
    expect(describeActiveWork(work)).toBe(text);
  });
});

describe('describeCancellation', () => {
  it('says "it" for one piece of work', () => {
    expect(describeCancellation({ uploads: 1, deletes: 0 }, 'Switching buckets')).toBe(
      '1 upload is still in progress.\nSwitching buckets cancels it.'
    );
  });

  it('says "them" for more than one', () => {
    expect(describeCancellation({ uploads: 1, deletes: 1 }, 'Connecting another account')).toBe(
      '1 upload and 1 delete are still in progress.\nConnecting another account cancels them.'
    );
  });
});
