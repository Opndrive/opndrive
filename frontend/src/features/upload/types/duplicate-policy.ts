/**
 * What to do when a dropped file already exists at the destination.
 *
 * `ask` raises the prompt, which is the default and the only behaviour there
 * used to be. The other two answer it in advance, for people who always give
 * the same answer and would rather not be asked at all.
 */
export type DuplicatePolicy = 'ask' | 'keepBoth' | 'replace';

export interface DuplicatePolicyConfig {
  policy: DuplicatePolicy;
  label: string;
  description: string;
}

export const DUPLICATE_POLICIES: Record<DuplicatePolicy, DuplicatePolicyConfig> = {
  ask: {
    policy: 'ask',
    label: 'Ask me',
    description: 'Show the prompt each time, with the option to answer for the whole drop.',
  },
  keepBoth: {
    policy: 'keepBoth',
    label: 'Keep both',
    description: 'Upload under a new name, leaving the existing file untouched.',
  },
  replace: {
    policy: 'replace',
    label: 'Replace',
    description: 'Overwrite the existing file. A notice records what was replaced.',
  },
};
