/**
 * Every named thing this app stores in a browser.
 *
 * This is the source of truth, not a description of one. The privacy policy
 * renders its table straight from this list, and `storage-keys.test.ts` walks
 * the source for storage writes and fails when it finds a key that is not
 * here. So a new key cannot ship without either appearing in the published
 * policy or turning the build red.
 *
 * That ordering matters. Privacy documents rot because the code moves and the
 * prose does not. Making the code the source removes the opportunity.
 *
 * Adding a key: add it here, with a purpose written for the person reading the
 * privacy policy rather than for us. If it is not strictly necessary, it also
 * needs a consent story before it ships - see the trigger table in
 * CONTRIBUTING.md.
 */

export type StorageMechanism = 'localStorage' | 'sessionStorage' | 'cookie';

/**
 * `necessary` means the key exists to deliver something the user explicitly
 * asked for, which is what exempts it from consent under ePrivacy Article
 * 5(3). Anything that is not necessary cannot simply be added to this list.
 */
export type StorageCategory = 'necessary';

export interface StorageKeyEntry {
  key: string;
  mechanisms: readonly StorageMechanism[];
  category: StorageCategory;
  /** Shown verbatim in the privacy policy. Write it for a reader, not for us. */
  purpose: string;
  lifetime: string;
  /**
   * True when `key` is a prefix and the real key has a scope appended at
   * runtime. The policy renders these as "key..." so the table is not claiming
   * an exact name it does not have.
   */
  hasDynamicSuffix?: boolean;
}

export const STORAGE_KEYS: readonly StorageKeyEntry[] = [
  {
    key: 's3_user_session',
    mechanisms: ['localStorage'],
    category: 'necessary',
    purpose: 'Your storage credentials, so a refresh does not sign you out',
    lifetime: 'Until you disconnect',
  },
  {
    key: 'ui-theme',
    mechanisms: ['localStorage'],
    category: 'necessary',
    purpose: 'Light, dark or system appearance',
    lifetime: 'Until you clear it',
  },
  {
    key: 'opndrive_user_settings',
    mechanisms: ['localStorage'],
    category: 'necessary',
    purpose: 'Start page, upload method and default sharing duration',
    lifetime: 'Until you clear it',
  },
  {
    key: 'opndrive-layout-preference',
    mechanisms: ['localStorage'],
    category: 'necessary',
    purpose: 'Whether files are shown as a grid or a list',
    lifetime: 'Until you clear it',
  },
  {
    key: 'delete-recovery-storage',
    mechanisms: ['localStorage'],
    category: 'necessary',
    purpose:
      'Lets an interrupted delete be recovered. Contains the names of the files it was working on',
    lifetime: 'Until the delete finishes or is abandoned',
  },
  {
    key: 'upload-settings-storage',
    mechanisms: ['localStorage'],
    category: 'necessary',
    purpose: 'Your upload preferences',
    lifetime: 'Until you clear it',
  },
  {
    key: 'sidebarOpen_global',
    mechanisms: ['localStorage'],
    category: 'necessary',
    purpose: 'Whether the main sidebar is open',
    lifetime: 'Until you clear it',
  },
  {
    key: 'sidebarOpen_settings',
    mechanisms: ['localStorage'],
    category: 'necessary',
    purpose: 'Whether the settings sidebar is open',
    lifetime: 'Until you clear it',
  },
  {
    // Found by storage-keys.test.ts on its first run: written since before the
    // privacy work started and disclosed nowhere, which is the exact failure
    // this registry exists to prevent.
    key: 'dashboard_sidebar_state',
    mechanisms: ['localStorage'],
    category: 'necessary',
    purpose: 'Which sidebar sections you have expanded',
    lifetime: 'Until you clear it',
    hasDynamicSuffix: true,
  },
  {
    key: 'opndrive-folder-rename-warning-dismissed',
    mechanisms: ['localStorage'],
    category: 'necessary',
    purpose: 'Remembers that you dismissed the folder rename cost warning',
    lifetime: 'Until you clear it',
  },
  {
    key: 'opndrive-folder-delete-warning-dismissed',
    mechanisms: ['localStorage'],
    category: 'necessary',
    purpose: 'Remembers that you dismissed the folder delete cost warning',
    lifetime: 'Until you clear it',
  },
  {
    key: 'opndrive-search-warning-dismissed',
    mechanisms: ['localStorage'],
    category: 'necessary',
    purpose: 'Remembers that you dismissed the search cost warning',
    lifetime: 'Until you clear it',
  },
  {
    key: 'sidebar_discord_cta_dismissed',
    mechanisms: ['sessionStorage'],
    category: 'necessary',
    purpose: 'Remembers that you dismissed the community prompt',
    lifetime: 'Until you close the tab',
  },
  {
    key: 'opndrive_privacy',
    mechanisms: ['cookie', 'localStorage'],
    category: 'necessary',
    purpose:
      'Records that you turned analytics off, so we can honour it here and on the documentation site. Only written if you actually opt out',
    lifetime: 'One year, or until you turn analytics back on',
  },
];

const REGISTERED = new Set(STORAGE_KEYS.map((entry) => entry.key));

export function isRegisteredStorageKey(key: string): boolean {
  return REGISTERED.has(key);
}

/** The keys the privacy policy lists, in the order it lists them. */
export function storageKeysForPolicy(): readonly StorageKeyEntry[] {
  return STORAGE_KEYS;
}
