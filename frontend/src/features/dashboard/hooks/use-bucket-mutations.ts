'use client';

import { useCallback, useMemo, useState } from 'react';
import { BYOS3ApiProvider } from '@opndrive/s3-api';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { useNotification } from '@/context/notification-context';
import { confirmAction } from '@/shared/components/ui/confirm-dialog';
import { failureFrom } from '@/lib/s3/connection-failure';
import { describeBucketNameError } from '@/lib/s3/bucket-name';
import { AWS_REGIONS, type RegionOption } from '@/config/providers';
import { useBucketsStore } from '@/features/dashboard/stores/use-buckets-store';

/**
 * Creating and deleting buckets.
 *
 * Kept apart from `use-buckets`, which discovers and nothing else, and from
 * `switchBucket`, which owns the active S3 identity. This hook owns neither:
 * it makes one call, tells the user what happened, and patches the discovered
 * list so the switcher agrees with reality without paying for another
 * ListBuckets.
 *
 * Creating a bucket deliberately does not switch to it. A switch tears down
 * every upload and delete in flight, so it is a thing a person asks for, not
 * something that happens because they made a bucket for later.
 */

interface SdkErrorShape {
  name?: unknown;
}

function errorName(error: unknown): string {
  const shape = (error ?? {}) as SdkErrorShape;

  return typeof shape.name === 'string' ? shape.name : '';
}

/**
 * Why a create failed, in words that name the fix.
 *
 * `classifyConnectionFailure` covers the failures every S3 surface shares -
 * bad keys, no permission, no network - but it has never seen the ones only a
 * create can produce, and would report them as "an error we do not recognise".
 * The taken-name case in particular is not a mistake the user made: S3 bucket
 * names are one global namespace, so a perfectly good name can be unavailable
 * because a stranger took it in 2011. Saying so is the difference between
 * trying another name and assuming the app is broken.
 */
export function describeBucketCreateFailure(error: unknown, bucketName: string): string {
  switch (errorName(error)) {
    case 'BucketAlreadyOwnedByYou':
      return `You already have a bucket called ${bucketName}.`;
    case 'BucketAlreadyExists':
      return `The name ${bucketName} is taken. Bucket names are shared across every S3 account, so a name someone else is using cannot be reused.`;
    case 'InvalidBucketName':
      return `Your provider rejected the name ${bucketName}.`;
    case 'InvalidLocationConstraint':
    case 'IllegalLocationConstraintException':
      // Reachable only if a client was built for one region and the request
      // reached another - which is the whole reason `createBucket` below
      // builds a provider for the chosen region rather than passing it along.
      return 'Your provider would not create a bucket in that region.';
    default: {
      const failure = failureFrom(error);

      return `${failure.title}. ${failure.detail}`;
    }
  }
}

/** Why a delete failed. Only the bucket-specific case; the rest is shared. */
export function describeBucketDeleteFailure(error: unknown, bucketName: string): string {
  if (errorName(error) === 'NoSuchBucket') {
    return `${bucketName} no longer exists.`;
  }

  const failure = failureFrom(error);

  return `${failure.title}. ${failure.detail}`;
}

export interface UseBucketMutationsResult {
  /** The region this session connects to, and the default for a new bucket. */
  region: string | null;
  /**
   * Whether a new bucket's region is the user's to pick.
   *
   * True only for real AWS S3, which is exactly the case where the session
   * carries no endpoint of its own and the SDK derives one per region. Every
   * other provider stores a resolved endpoint - `https://s3.eu-west-1.
   * wasabisys.com`, an R2 account URL, a MinIO host - and that URL, not the
   * region string beside it, decides where a bucket can be created. Offering a
   * list there would be offering a choice the request cannot honour.
   */
  canChooseRegion: boolean;
  /** Regions to offer, with the session's own included even if AWS has not listed it yet. */
  regionOptions: RegionOption[];
  isCreating: boolean;
  /** The bucket a delete is running for, or null. One at a time. */
  deletingBucket: string | null;
  /**
   * Creates a bucket, in `region` when one is given and this session is free
   * to choose. Resolves true when the bucket now exists.
   */
  createBucket: (bucketName: string, region?: string) => Promise<boolean>;
  /**
   * Asks for confirmation, then deletes. Resolves true only when the bucket is
   * gone - a declined confirmation and a refusal both resolve false.
   */
  deleteBucket: (bucketName: string) => Promise<boolean>;
}

export function useBucketMutations(): UseBucketMutationsResult {
  const { apiS3, userCreds } = useAuthGuard();
  const { success: notifySuccess, error: notifyError } = useNotification();

  const addBucket = useBucketsStore((state) => state.addBucket);
  const removeBucket = useBucketsStore((state) => state.removeBucket);

  const [isCreating, setIsCreating] = useState(false);
  const [deletingBucket, setDeletingBucket] = useState<string | null>(null);

  const sessionRegion = userCreds?.region ?? null;

  /**
   * An endpoint pins the location; its absence is what makes the region a
   * free choice. The provider slug is not persisted with the session - only
   * the region and, for everyone but AWS, the resolved endpoint - so this is
   * the signal that is actually available at runtime, rather than a guess at
   * which provider the user connected with.
   */
  const canChooseRegion = apiS3 !== null && !userCreds?.endpoint;

  const regionOptions = useMemo(() => {
    if (!sessionRegion) return AWS_REGIONS;

    // AWS opens regions faster than this list gets updated, and a session
    // already connected to one is proof it exists. Without this the select
    // would open on a blank row and silently move the bucket somewhere else.
    if (AWS_REGIONS.some((option) => option.value === sessionRegion)) return AWS_REGIONS;

    return [{ value: sessionRegion, label: sessionRegion }, ...AWS_REGIONS];
  }, [sessionRegion]);

  const createBucket = useCallback(
    async (rawName: string, region?: string): Promise<boolean> => {
      if (!apiS3 || !userCreds || isCreating) return false;

      const bucketName = rawName.trim();

      // Checked again here rather than trusted from the form. The form is one
      // caller; this is the last thing standing between a name and a request
      // that comes back with an error naming no rule.
      const nameError = describeBucketNameError(bucketName);
      if (nameError) {
        notifyError(nameError);
        return false;
      }

      const targetRegion = (canChooseRegion && region?.trim()) || userCreds.region;

      setIsCreating(true);

      try {
        /**
         * A provider built for the target region, not the session's own.
         *
         * S3 refuses a CreateBucket whose LocationConstraint does not match
         * the regional endpoint the request arrived at - the client's region
         * decides where the bucket can go, and no per-request override exists
         * in the SDK. So passing a region down to `createBucket` would be a
         * parameter that produces the very error it appears to solve; the
         * client has to be built for the region instead.
         *
         * `switchBucket` builds one the same way and for the same reason. It
         * touches no network, and this one is thrown away as soon as the
         * request is done: nothing about the session changes, and creating a
         * bucket in Frankfurt does not move the session to Frankfurt.
         */
        const creator =
          targetRegion === userCreds.region
            ? apiS3
            : new BYOS3ApiProvider(
                { ...userCreds, region: targetRegion, bucketName, prefix: '' },
                'BYO'
              );

        await creator.createBucket(bucketName);

        // Only once it has succeeded. A row added first and rolled back on
        // failure would be a bucket the user saw, and could have clicked.
        //
        // Recorded against the session's provider, whose list this is, and
        // carrying the region it was actually made in - that is what a later
        // switch needs to rebuild the client for the right place.
        addBucket(apiS3, { name: bucketName, region: targetRegion, createdAt: new Date() });
        notifySuccess(`Created ${bucketName} in ${targetRegion}.`);

        return true;
      } catch (error) {
        console.error('Bucket creation failed', error);
        notifyError(describeBucketCreateFailure(error, bucketName));

        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [addBucket, apiS3, canChooseRegion, isCreating, notifyError, notifySuccess, userCreds]
  );

  const deleteBucket = useCallback(
    async (bucketName: string): Promise<boolean> => {
      if (!apiS3 || deletingBucket !== null) return false;

      // The session is pointed at this bucket. Deleting it would leave every
      // later request addressing something that is not there, with no sensible
      // bucket to fall back to. Refused rather than offered and then explained.
      if (bucketName === apiS3.getBucketName()) {
        notifyError('You cannot delete the bucket you are working in. Switch to another first.');
        return false;
      }

      const confirmed = await confirmAction({
        title: `Delete ${bucketName}?`,
        description:
          'This cannot be undone.\nS3 only deletes empty buckets, so anything still stored in it has to be removed first.',
        confirmLabel: 'Delete bucket',
        destructive: true,
      });

      if (!confirmed) return false;

      setDeletingBucket(bucketName);

      try {
        const result = await apiS3.deleteBucket(bucketName);

        // Not an error, and not worth retrying: the bucket still holds
        // objects, versions or delete markers. `deleteBucket` never empties a
        // bucket itself, and nothing here is going to start.
        if (result.status === 'not-empty') {
          notifyError(
            `${bucketName} still has objects in it. Empty it - including old versions - and try again.`
          );
          return false;
        }

        removeBucket(apiS3, bucketName);
        notifySuccess(`Deleted ${bucketName}.`);

        return true;
      } catch (error) {
        console.error('Bucket deletion failed', error);
        notifyError(describeBucketDeleteFailure(error, bucketName));

        return false;
      } finally {
        setDeletingBucket(null);
      }
    },
    [apiS3, deletingBucket, notifyError, notifySuccess, removeBucket]
  );

  return {
    region: sessionRegion,
    canChooseRegion,
    regionOptions,
    isCreating,
    deletingBucket,
    createBucket,
    deleteBucket,
  };
}
