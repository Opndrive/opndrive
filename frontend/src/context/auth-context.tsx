'use client';

import type React from 'react';
import { createContext, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  BYOS3ApiProvider,
  Credentials,
  UploadManager,
  SignedUrlUploadManager,
} from '@opndrive/s3-api';
import { useDriveStore } from './data-context';
import { ConnectionFailureError, classifyConnectionFailure } from '@/lib/s3/connection-failure';
import { clearLegacyUploadState } from '@/lib/privacy/legacy-storage';
import { countActiveWork, useUploadStore } from '@/features/upload/stores/use-upload-store';
import type { ActiveWork } from '@/features/upload/stores/use-upload-store';
import { useUploadQueueStore } from '@/features/upload/stores/use-upload-queue-store';
import { useSearchStore } from '@/features/dashboard/stores/use-search-store';
import {
  type Connection,
  type ConnectionDetails,
  findConnection,
  readConnections,
  refreshConnection,
  addConnection,
  writeConnections,
} from '@/lib/connections/connections';

/**
 * Proves the credentials work before a session is built on them.
 *
 * Constructing a `BYOS3ApiProvider` touches no network, so before this every
 * set of credentials "connected" successfully and only failed later, on the
 * dashboard's first listing - far from the form that could fix them.
 *
 * Lists one object rather than calling HeadBucket: some buckets allow GET but
 * not HEAD, and rejecting those would lock out people whose credentials are
 * perfectly good. Scoped to the configured prefix, because a key may be
 * permitted to list `team/` without being permitted to list the bucket root.
 * The point is to make exactly the request the app depends on.
 */
async function verifyCredentials(api: BYOS3ApiProvider, creds: Credentials): Promise<void> {
  await api.fetchDirectoryStructure(creds.prefix ?? '', 1);
}

/**
 * How many files upload at once.
 *
 * Owned by the s3-api managers, which is why nothing downstream keeps a pool.
 * Three is a compromise: enough to keep a connection busy through the latency
 * of small files, few enough that a browser's per-host connection budget still
 * leaves room for listings and previews.
 */
const UPLOAD_CONCURRENCY = 3;

/**
 * What `switchBucket` did, for the one outcome that is not an error.
 *
 * A structured result rather than a throw, on the same reasoning as the
 * s3-api's `deleteBucket`: "there is work in flight, ask first" is an expected
 * answer a caller has to render, not an exception. Anything that genuinely
 * went wrong still throws.
 *
 * - `switched`  - the session is now on `bucketName`.
 * - `unchanged` - already there. Nothing was torn down; see `switchBucket`.
 * - `blocked`   - uploads or deletes are still running, and cancelling them
 *   was not authorised. Nothing was touched. Confirm with the user, then call
 *   again with `{ discardActiveWork: true }`.
 */
export type BucketSwitchResult =
  | { status: 'switched'; bucketName: string }
  | { status: 'unchanged'; bucketName: string }
  | { status: 'blocked'; activeWork: ActiveWork };

export interface SwitchBucketOptions {
  /**
   * Proceed even though uploads or deletes are running, cancelling them.
   *
   * Off by default: switching disposes the upload managers and aborts every
   * delete, so a switch taken without asking silently destroys work the user
   * started. The confirmation itself belongs to whoever has a UI; this only
   * refuses to do it behind their back.
   */
  discardActiveWork?: boolean;
}

/**
 * What `switchConnection` did. Same shape and same reasoning as
 * `BucketSwitchResult`: "work is in flight, ask first" is an answer, not an
 * exception.
 */
export type ConnectionSwitchResult =
  | { status: 'switched'; connectionId: string }
  | { status: 'unchanged'; connectionId: string }
  | { status: 'blocked'; activeWork: ActiveWork };

interface AuthContextType {
  apiS3: BYOS3ApiProvider | null;
  uploadManager: UploadManager | null;
  signedUrlUploadManager: SignedUrlUploadManager | null;
  userCreds: Credentials | null;
  /** Every saved connection. */
  connections: Connection[];
  /** The id of the saved connection the session is on, or null. */
  activeConnectionId: string | null;
  isLoading: boolean;
  /**
   * Establishes a session and saves it as a connection. `details` carries the
   * alias and provider the user chose, neither of which are part of the
   * credentials themselves.
   */
  createSession: (creds: Credentials, details?: ConnectionDetails) => Promise<void>;
  switchConnection: (
    connectionId: string,
    options?: SwitchBucketOptions
  ) => Promise<ConnectionSwitchResult>;
  removeConnection: (connectionId: string) => void;
  switchBucket: (
    bucketName: string,
    region?: string,
    options?: SwitchBucketOptions
  ) => Promise<BucketSwitchResult>;
  clearSession: () => void;
}

function isValidCreds(c: Credentials): c is Credentials {
  return (
    typeof c?.accessKeyId === 'string' &&
    typeof c?.secretAccessKey === 'string' &&
    typeof c?.region === 'string'
  );
}

/**
 * UploadManager.getInstance()/SignedUrlUploadManager.getInstance() return the
 * first instance ever built and silently discard the config passed to every
 * later call. Left unchecked, switching accounts or buckets keeps uploading
 * to whichever bucket was connected first.
 *
 * @opndrive/s3-api 2.6.0 adds a disposeInstance() static that cancels
 * in-flight uploads and clears the singleton so the next getInstance() call
 * builds fresh. The installed 2.5.0 does not have it yet, so this is called
 * through a feature-detecting cast rather than a direct reference - once
 * frontend/package.json depends on ^2.6.0, delete the cast and call
 * `UploadManager.disposeInstance()` / `SignedUrlUploadManager.disposeInstance()`
 * directly.
 */
type Disposable = { disposeInstance?: () => Promise<void> };

let warnedAboutLegacyUploadManager = false;

async function disposeUploadManagers(): Promise<void> {
  const managerCtor = UploadManager as unknown as Disposable;
  const signedCtor = SignedUrlUploadManager as unknown as Disposable;

  if (!managerCtor.disposeInstance || !signedCtor.disposeInstance) {
    if (!warnedAboutLegacyUploadManager) {
      warnedAboutLegacyUploadManager = true;
      console.warn(
        '[opndrive] The installed @opndrive/s3-api predates 2.6.0, so upload ' +
          'managers cannot be disposed on session change. Switching buckets ' +
          'without a full page reload may keep uploading to the previous ' +
          'bucket. Upgrade to ^2.6.0.'
      );
    }
    return;
  }

  await Promise.all([managerCtor.disposeInstance(), signedCtor.disposeInstance()]);
}

/**
 * Disposes any existing singletons, then builds fresh managers bound to
 * `api`. Shared by both session-restore and interactive login so every path
 * that establishes a session gets the same guarantee.
 */
async function initializeUploadManagers(
  api: BYOS3ApiProvider,
  creds: Credentials
): Promise<{ manager: UploadManager; signedUrlManager: SignedUrlUploadManager }> {
  await disposeUploadManagers();

  // Establishing a session must not inherit a previous one's search results.
  // clearSession() already does this, but /connect is reachable client-side
  // without logging out first, so a session can start without one ever having
  // been cleared. Same belt-and-braces reasoning as disposing the upload
  // managers on both edges rather than only on logout.
  useSearchStore.getState().clearCache();

  // And on the same reasoning, a delete authorised for the previous bucket
  // must not still be running against it once a new session has begun. A no-op
  // on the restore-at-startup path, where nothing is in flight yet.
  //
  // `clearSessionData` rather than `abortAllDeleteOperations` alone, which is
  // all this used to do. Aborting stopped the work but left every record of it
  // on the operations card, so switching bucket carried the previous bucket's
  // uploads and deletes across with it - rows naming files that are not in the
  // bucket now on screen. It aborts first and then wipes, in that order,
  // because the map it clears holds the only reference to each abort
  // controller; see the note on the store.
  useUploadStore.getState().clearSessionData();

  // The names those uploads had claimed go with them. A claim says a prefix in
  // *this* bucket is spoken for, and it is keyed by the prefix alone - so
  // carried into another bucket it still answers for "photos/", and a folder
  // dropped there is uploaded as "photos (1)" with a notice that one "was
  // already here". Neither is true of a bucket nothing has been uploaded to.
  // The notices are dropped for the same reason the cards above are: each one
  // describes a drop into the bucket being left.
  useUploadQueueStore.getState().reset();

  // The listing cache needs it most of all, and was the one thing this did not
  // clear. `fetchData` returns early when a prefix is already 'ready' or has
  // rows cached, so connecting a second bucket without logging out first left
  // the dashboard showing the previous bucket's file and folder names, and
  // never refetching them until a full page reload.
  //
  // That path stopped being obscure when the connect pages stopped redirecting
  // a signed-in visitor away: adding a second bucket is a thing people can now
  // walk into from a bookmark. This also drops the in-flight request ids, so a
  // listing issued for the old bucket cannot land as the new one's.
  useDriveStore.getState().clearAllData();

  // This is the ONE place upload concurrency is set. The executor deliberately
  // has no pool of its own - two components each believing they control how
  // many uploads are in flight is how "3 at a time" becomes six.
  const manager = UploadManager.getInstance({
    s3: api.getS3Client(),
    bucket: api.getBucketName(),
    prefix: creds.prefix || '',
    maxConcurrency: UPLOAD_CONCURRENCY,
    partSizeMB: 5,
  });

  const signedUrlManager = SignedUrlUploadManager.getInstance({
    apiProvider: api,
    maxConcurrency: UPLOAD_CONCURRENCY,
    expiresInSeconds: 3600,
  });

  return { manager, signedUrlManager };
}

export const AuthContext = createContext<AuthContextType>({
  apiS3: null,
  uploadManager: null,
  signedUrlUploadManager: null,
  userCreds: null,
  connections: [],
  activeConnectionId: null,
  isLoading: true,
  createSession: async () => {
    throw new Error('AuthContext not initialized');
  },
  switchConnection: async () => {
    throw new Error('AuthContext not initialized');
  },
  removeConnection: () => {
    throw new Error('AuthContext not initialized');
  },
  switchBucket: async () => {
    throw new Error('AuthContext not initialized');
  },
  clearSession: () => {
    throw new Error('AuthContext not initialized');
  },
});

const STORAGE_KEY = 's3_user_session';

/**
 * Writes the session to storage, treating a refusal as non-fatal.
 *
 * `setItem` throws on a full quota and in browsers set to refuse site data
 * outright. For a switch that has *already happened* - managers rebuilt, state
 * updated, dashboard about to render the new bucket - reporting that as a
 * failed switch would be a lie, and rolling back to undo a write that never
 * landed would be worse. The one real consequence is that a reload restores
 * the previous bucket, so it is logged rather than swallowed in silence.
 *
 * Deliberately not used by `createSession`, where a storage failure happens
 * before anything is live and is genuinely fatal to the session it was
 * establishing.
 */
function persistSession(creds: Credentials): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  } catch (error) {
    console.warn(
      '[opndrive] The session could not be saved to this browser. The switch ' +
        'has taken effect, but a reload will return to the previous bucket.',
      error
    );
  }
}

/**
 * Routes that must render before a session has been looked for.
 *
 * `isLoading` starts true, so the placeholder below is what the server renders
 * for every route - meaning the whole app currently serves `Loading...` as its
 * HTML and only shows real content once JavaScript has run.
 *
 * That is tolerable for the dashboard, which is useless without a session
 * anyway. It is not tolerable for a page that has to be read before anyone has
 * a session: a privacy policy has to be readable and indexable on its own, and
 * /connect is a landing page we actively want ranked. A crawler that is served
 * `Loading...` indexes `Loading...`.
 *
 * `/` is in the list for exactly that reason, and was the conspicuous omission:
 * the marketing page - the hero, the features, the FAQ, the whole pitch - was
 * the one public page still serving `Loading...` as its entire body to anyone
 * who arrived without JavaScript, crawlers included.
 *
 * `/blog` was missing for the same reason, and so the blog index and every post
 * reached a crawler as `Loading...` with the article only in the client
 * payload. A blog that cannot be read without JavaScript is not much of one.
 *
 * Matching covers children, so /connect/cloudflare-r2 and /blog/some-post are
 * public too. It does not make `/` match everything: the child test looks for a
 * `/` *after* the route, and no path begins with `//`.
 */
const PUBLIC_ROUTES = ['/', '/privacy', '/terms', '/connect', '/blog'];

function isPublicRoute(pathname: string | null): boolean {
  if (pathname === null) return false;

  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * How long logout keeps the loading placeholder up before letting children
 * render again.
 *
 * It exists to give `router.push('/')` time to commit, so the dashboard is not
 * briefly re-rendered without a session behind it. Matches the 100ms + 50ms the
 * two nested timers used to add up to.
 */
const LOGOUT_GATE_MS = 150;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [apiS3, setApiS3] = useState<BYOS3ApiProvider | null>(null);
  const [uploadManager, setUploadManager] = useState<UploadManager | null>(null);
  const [signedUrlUploadManager, setSignedUrlUploadManager] =
    useState<SignedUrlUploadManager | null>(null);
  const [userCreds, setUserCreds] = useState<Credentials | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connections, setConnections] = useState<Connection[]>([]);

  /**
   * The list as of right now, for handlers that must not read a stale render.
   * `createSession` and the switchers run from event handlers that may have
   * closed over an older `connections`; writing from state would drop an entry
   * added in between.
   */
  const connectionsRef = useRef<Connection[]>([]);

  /**
   * Which saved connection the live session is on.
   *
   * Tracked by id, not worked out by comparing credentials: a bucket switch
   * moves the session to credentials that match no saved entry yet, and two
   * entries can share the same keys. State for rendering, ref for handlers that
   * must not read a stale render.
   */
  const [activeConnectionId, setActiveConnectionIdState] = useState<string | null>(null);
  const activeConnectionIdRef = useRef<string | null>(null);

  const setActiveConnectionId = (id: string | null) => {
    activeConnectionIdRef.current = id;
    setActiveConnectionIdState(id);
  };

  /** Applies a change to the saved list, in memory and in storage. */
  const updateConnections = (change: (list: Connection[]) => Connection[]) => {
    const next = change(connectionsRef.current);

    connectionsRef.current = next;
    setConnections(next);
    writeConnections(next);
  };

  const router = useRouter();
  const pathname = usePathname();

  // Get clearAllData at the top level where hooks are allowed
  const clearAllData = useDriveStore((state) => state.clearAllData);

  /**
   * The one timer logout still needs, held so it can be cancelled.
   *
   * Logout used to defer its work behind two nested uncancelled timers. Nothing
   * stopped them, so they fired into whatever was left of the tree: harmless in
   * the browser, where this provider only unmounts with the page, but in tests
   * they land after the DOM has gone and throw `window is not defined`.
   */
  const gateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Whether a bucket switch is mid-flight. See `switchBucket`. */
  const isSwitching = useRef(false);

  useEffect(() => {
    return () => {
      if (gateTimer.current !== null) clearTimeout(gateTimer.current);
    };
  }, []);

  const clearSessionState = () => {
    setUserCreds(null);
    setApiS3(null);
    setUploadManager(null);
    setSignedUrlUploadManager(null);
  };

  /** Lets children render again once the route change has had time to commit. */
  const releaseLoadingGate = () => {
    if (gateTimer.current !== null) clearTimeout(gateTimer.current);

    gateTimer.current = setTimeout(() => {
      gateTimer.current = null;
      setIsLoading(false);
    }, LOGOUT_GATE_MS);
  };

  // Restore session from localStorage on app load
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);

      // The saved list is read before the session so it is available to every
      // route, not only to those that restore one. Applied unconditionally: a
      // visitor with saved connections but no live session still has them.
      const saved = readConnections();
      connectionsRef.current = saved;
      setConnections(saved);

      try {
        const storedCreds = localStorage.getItem(STORAGE_KEY);
        if (storedCreds) {
          const creds = JSON.parse(storedCreds);
          if (isValidCreds(creds)) {
            const api = new BYOS3ApiProvider(creds, 'BYO');

            const { manager, signedUrlManager } = await initializeUploadManagers(api, creds);

            setUploadManager(manager);
            setSignedUrlUploadManager(signedUrlManager);
            setUserCreds(creds);
            setApiS3(api);

            // A session that predates saved connections has no entry in the
            // list, and the switcher would show an empty menu above a
            // dashboard that is plainly connected. Adopt it, so upgrading
            // costs nobody their connection.
            const match = findConnection(connectionsRef.current, creds);

            if (match) {
              setActiveConnectionId(match.id);
            } else {
              const { list, connection } = addConnection(connectionsRef.current, creds);

              updateConnections(() => list);
              setActiveConnectionId(connection.id);
            }

            // Restoring a session deliberately does not navigate anywhere.
            //
            // It used to push to /dashboard from `/`, `/connect` and the
            // provider pages. All three are pages with something to read: the
            // landing page is the pitch, and /connect and /connect/[provider]
            // exist to be found in search. Bouncing a visitor off them meant
            // the page Google indexed was the one page a returning user could
            // never see, and someone with a bucket already connected could not
            // reach the form to add a second.
            //
            // It also read far more into the signal than was there. There is
            // no account here - "signed in" means access keys are sitting in
            // this browser's localStorage, which a shared machine or a visit
            // three months ago satisfies just as well as present intent.
            //
            // Signed-in visitors get a "Go to Dashboard" control on those
            // pages instead, so the way through is visible without the choice
            // being made for them. Connecting a bucket still navigates, in
            // ConnectWizard, because that is a thing the user just asked for.
          } else {
            throw new Error('Invalid credentials in storage');
          }
        }
      } catch (error) {
        console.error('Failed to restore session : ', error);
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };

    // Once per load, and unrelated to the session below except that both are
    // about what this browser is holding: upload state an earlier version
    // wrote and never read. See lib/privacy/legacy-storage.
    clearLegacyUploadState();

    checkAuth();
    // Mount-only on purpose. This restores a persisted session exactly once
    // per app load; including `pathname`/`router` would re-run the whole
    // restore on every client-side navigation, and including `clearSession`
    // would re-run it whenever the provider re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create a session & persist in localStorage
  const createSession = async (creds: Credentials, details?: ConnectionDetails): Promise<void> => {
    try {
      setIsLoading(true);
      const api = new BYOS3ApiProvider(creds, 'BYO');

      await verifyCredentials(api, creds);

      const { manager, signedUrlManager } = await initializeUploadManagers(api, creds);

      // Persist to state and localStorage
      setUserCreds(creds);
      setApiS3(api);
      setUploadManager(manager);
      setSignedUrlUploadManager(signedUrlManager);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));

      // Saved only once the session is live, so the list never holds an
      // account whose keys were just rejected. A storage refusal here is not
      // fatal: the session above is already up, and `writeConnections` says so
      // in the console.
      //
      // Always appended, never merged: there is no deduplication, so even an
      // exact repeat of a saved connection becomes another entry.
      const { list, connection } = addConnection(connectionsRef.current, creds, details);

      updateConnections(() => list);
      setActiveConnectionId(connection.id);

      // Deliberately does not navigate. The one caller is ConnectWizard, which
      // lives at /connect/[provider] and pushes to /dashboard itself once this
      // resolves - so the branch this replaced could only ever have fired from
      // `/` or `/login`, and neither has a form on it. `/login` is not even a
      // route. Navigation belongs to the caller that knows why it called.
    } catch (error) {
      console.error('Login failed', error);

      // Rethrown as a classified failure so the form can name the actual
      // problem. A wrong region, a missing CORS rule and a revoked key are
      // fixed in three different places, and "Login failed" pointed at none
      // of them.
      throw new ConnectionFailureError(classifyConnectionFailure(error));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Replaces the live session with `candidate`, after proving it works.
   *
   * The one teardown-and-rebuild path, shared by bucket switches and connection
   * switches so neither can drift from the other. See `switchBucket` for why a
   * switch builds a new provider instead of mutating the old one.
   *
   * Order is the whole point: the candidate is proved against the network
   * before anything belonging to the current session is disposed. A target that
   * turns out not to exist, or that these keys cannot read, leaves the session
   * exactly as it was.
   */
  const swapSession = async (
    candidate: Credentials,
    connectionId: string | null,
    options?: SwitchBucketOptions
  ): Promise<{ status: 'swapped' } | { status: 'blocked'; activeWork: ActiveWork }> => {
    if (!options?.discardActiveWork) {
      const activeWork = countActiveWork(useUploadStore.getState());

      if (activeWork.uploads > 0 || activeWork.deletes > 0) {
        return { status: 'blocked', activeWork };
      }
    }

    // Two switches running at once would each dispose the other's managers and
    // race to persist their own credentials, and the loser's provider would
    // outlive the winner's session. The loading gate below hides the UI that
    // could start a second one, so this only has to catch a programmatic
    // caller - refusing is enough.
    //
    // Everything above returns before the flag is taken, so a `blocked` or
    // `unchanged` answer can never leave it set.
    if (isSwitching.current) {
      throw new Error('a session switch is already in progress');
    }

    isSwitching.current = true;

    /**
     * Whether this call is the one holding the loading gate up.
     *
     * The gate is lowered only by the path that raised it. A switch that fails
     * verification never raises it at all, and lowering it unconditionally
     * would lift a gate the startup restore is still holding.
     */
    let gateRaised = false;

    try {
      // Inside the try for the flag's sake. This builds an S3Client from the
      // candidate's region and endpoint, and a throw out here with the flag
      // still set would refuse every later switch for the life of the page -
      // one bad endpoint and the picker is dead until a reload.
      const api = new BYOS3ApiProvider(candidate, 'BYO');

      try {
        // The same one-object listing /connect uses, and for the same reason -
        // except here the cost of skipping it is higher, because the session
        // it would replace is a working one.
        await verifyCredentials(api, candidate);
      } catch (error) {
        console.error('Bucket switch failed', error);

        // Classified like createSession's, so the caller can say whether the
        // bucket is missing, in another region, or simply not readable by
        // these keys. Nothing has been torn down at this point.
        throw new ConnectionFailureError(classifyConnectionFailure(error));
      }

      // Verified. Everything past here belongs to the new session, so the gate
      // goes up: children are replaced by the placeholder for the length of
      // the swap rather than being handed a session that is half of each.
      setIsLoading(true);
      gateRaised = true;

      // Nothing in here rejects, which is what makes the teardown safe to
      // start: `disposeInstance` clears the singleton synchronously and
      // swallows its own cancellation errors, `getInstance` only assigns
      // fields, and the three store resets are plain zustand writes. So there
      // is no path that disposes the old managers and then fails to build the
      // new ones - the half-switched state this ordering would otherwise have
      // to recover from cannot arise.
      const { manager, signedUrlManager } = await initializeUploadManagers(api, candidate);

      // Applied in one continuation, so React commits them as a single update
      // and a consumer of the context never reads the new credentials against
      // the old provider. What makes that hold rather than merely usually hold
      // is downstream: the effects that react to a switch key off `apiS3` and
      // read the prefix back off that same object, never off `userCreds`, so
      // none of them can pair one bucket's provider with another's session.
      setUserCreds(candidate);
      setApiS3(api);
      setUploadManager(manager);
      setSignedUrlUploadManager(signedUrlManager);

      // Persisted only once the live session is actually on the new target.
      // Written any earlier, a failure above would leave storage claiming a
      // session the app is not on, and the next reload would restore it.
      persistSession(candidate);

      // The saved copy of this account follows the session, so choosing the
      // connection again later returns to the bucket it was last on.
      setActiveConnectionId(connectionId);
      updateConnections((list) => refreshConnection(list, connectionId, candidate));

      // The old prefix is gone with the old session, and the browse route
      // carries one in its URL. Sending the user to the dashboard root is what
      // stops the app asking the new bucket for the old bucket's folder.
      router.push('/dashboard');

      return { status: 'swapped' };
    } finally {
      if (gateRaised) setIsLoading(false);
      isSwitching.current = false;
    }
  };

  /**
   * Moves the session to another bucket on the credentials it already has.
   *
   * Deliberately not `apiS3.setBucketName()`, even though the provider offers
   * it. Mutating the bucket in place keeps the same object identity, and
   * identity is what everything downstream watches to know its context has
   * changed: `useSearch` memoises its service on it, the download store keys
   * off it, the upload executor compares against it. Changing the bucket
   * underneath them leaves every one of them serving bucket A's caches while
   * the app says bucket B. So a switch builds a new provider, and the same
   * teardown that a new session gets runs against the old one.
   *
   * Order is the whole point: the candidate is proved against the network
   * before anything belonging to the current bucket is disposed. A bucket that
   * turns out not to exist, or that these keys cannot read, leaves the session
   * exactly as it was.
   */
  const switchBucket = async (
    bucketName: string,
    region?: string,
    options?: SwitchBucketOptions
  ): Promise<BucketSwitchResult> => {
    const current = userCreds;

    if (!current) {
      throw new Error('switchBucket: there is no session to switch');
    }

    const nextBucket = bucketName.trim();

    if (!nextBucket) {
      throw new Error('switchBucket: bucketName is required');
    }

    // Only the region we were handed, or the one we already have. No guessing:
    // a bucket's real region comes from whoever listed it, and inventing one
    // here would just move the redirect error somewhere harder to read.
    const nextRegion = region?.trim() || current.region;

    // Cheap comparisons before any network call. Re-picking the bucket you are
    // already on is a thing a dropdown makes very easy to do, and answering it
    // with a full teardown would cancel every upload in flight for nothing.
    if (nextBucket === current.bucketName && nextRegion === current.region) {
      return { status: 'unchanged', bucketName: nextBucket };
    }

    // Built immutably from the current credentials: the keys, the endpoint
    // and anything else the provider needs stay exactly as they are, and the
    // existing object is never edited, so a failure in `swapSession` leaves
    // nothing half-rewritten.
    //
    // The prefix is dropped rather than carried over. It names a folder in
    // the bucket being left, and the odds that the same path means anything
    // in the new one are poor - a prefix that does not exist lists empty,
    // which reads as "this bucket is empty" rather than "you are looking in
    // the wrong place". Every switch therefore lands at the bucket root.
    const candidate: Credentials = {
      ...current,
      bucketName: nextBucket,
      region: nextRegion,
      prefix: '',
    };

    const outcome = await swapSession(candidate, activeConnectionIdRef.current, options);

    if (outcome.status === 'blocked') {
      return { status: 'blocked', activeWork: outcome.activeWork };
    }

    return { status: 'switched', bucketName: nextBucket };
  };

  /**
   * Moves the session to a saved connection.
   *
   * The connection's own credentials are used as stored, bucket and prefix
   * included - it is a different account being returned to, and landing where
   * it was last left is the point. Everything else is `swapSession`, the same
   * verify-then-teardown path a bucket switch takes, so a connection whose keys
   * have since been revoked fails on the way in and leaves the current session
   * exactly as it was.
   */
  const switchConnection = async (
    connectionId: string,
    options?: SwitchBucketOptions
  ): Promise<ConnectionSwitchResult> => {
    const target = connectionsRef.current.find((entry) => entry.id === connectionId);

    if (!target) {
      throw new Error('switchConnection: that connection no longer exists');
    }

    // Already the live connection: nothing to tear down.
    if (connectionId === activeConnectionIdRef.current && userCreds) {
      return { status: 'unchanged', connectionId };
    }

    const outcome = await swapSession(target.authContext, target.id, options);

    if (outcome.status === 'blocked') {
      return { status: 'blocked', activeWork: outcome.activeWork };
    }

    return { status: 'switched', connectionId };
  };

  /**
   * Forgets a saved connection.
   *
   * The connection in use cannot be removed - it is the session, and
   * `clearSession` is how that one ends. Refused by throwing rather than by a
   * quiet return so a caller that skipped the check finds out.
   */
  const removeConnection = (connectionId: string): void => {
    const target = connectionsRef.current.find((entry) => entry.id === connectionId);

    if (!target) return;

    if (userCreds && connectionId === activeConnectionIdRef.current) {
      throw new Error('removeConnection: the connection in use cannot be removed');
    }

    updateConnections((list) => list.filter((entry) => entry.id !== connectionId));
  };

  // Clear session completely
  const clearSession = () => {
    try {
      // Set loading state to prevent components from using context values
      setIsLoading(true);

      // Stop destructive work first. A folder delete walks its keys in a loop
      // holding the apiS3 it started with, so nulling the provider below does
      // nothing to it - it keeps deleting with the credentials of the session
      // being signed out of. Aborting is the only thing that reaches it.
      //
      // Note this is deliberately tied to the session and not to component
      // unmount: a route change from Browse to Search must not abandon a
      // 10,000 object delete halfway through.
      useUploadStore.getState().abortAllDeleteOperations();

      // Dispose the upload manager singletons so a new session cannot resume
      // uploading to this bucket. disposeUploadManagers() never throws, and
      // it clears the static singleton reference synchronously before doing
      // any awaiting, so it is safe to fire-and-forget here rather than
      // block logout on in-flight cancellation network calls.
      void disposeUploadManagers().catch((error) => {
        console.warn('Error cleaning up uploads during logout:', error);
      });

      // Clear all drive store data to prevent data leakage between sessions
      clearAllData();

      // Same for upload/delete history. Disposal above emits a 'cancelled'
      // event per in-flight item, and those land in the upload store before
      // UploadProvider unmounts - without this, records from this bucket would
      // still be on screen after connecting to a different one.
      useUploadStore.getState().clearSessionData();

      // And what the upload queue was holding for it: the names claimed in
      // this bucket, and the notices about drops into it. Both are in memory
      // only, so a reload would have cleared them - but signing out and back
      // in does not reload anything.
      useUploadQueueStore.getState().reset();

      // And the search cache, which holds raw object keys from this bucket.
      // It is keyed by query+prefix with a 5 minute TTL and nothing else
      // clears it, so without this a repeat search after switching accounts
      // is served the previous account's file and folder names straight out
      // of memory.
      useSearchStore.getState().clearCache();

      // Clear localStorage
      localStorage.removeItem(STORAGE_KEY);

      // Signing out forgets the account being signed out of, keys included -
      // "Clear Session" on a shared machine must not leave them behind in the
      // list. Other saved connections are left alone: they are not what was
      // asked to be cleared.
      const leavingId = activeConnectionIdRef.current;
      if (leavingId !== null) {
        updateConnections((list) => list.filter((entry) => entry.id !== leavingId));
      }
      setActiveConnectionId(null);

      // Navigate away from authenticated routes first
      router.push('/');

      // Cleared straight away rather than behind a timer. `setIsLoading(true)`
      // above lands in this same update, so the placeholder has already taken
      // the place of every child and there is nobody left to read a half
      // cleared session. Only lifting the gate has to wait.
      clearSessionState();
      releaseLoadingGate();
    } catch (error) {
      console.error('Error clearing session:', error);
      clearSessionState();
      clearAllData();
      releaseLoadingGate();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        apiS3,
        uploadManager,
        signedUrlUploadManager,
        userCreds,
        connections,
        activeConnectionId,
        isLoading,
        createSession,
        switchConnection,
        removeConnection,
        switchBucket,
        clearSession,
      }}
    >
      {isLoading && !isPublicRoute(pathname) ? (
        <div className="flex h-screen items-center justify-center">
          <p>Loading...</p>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};
