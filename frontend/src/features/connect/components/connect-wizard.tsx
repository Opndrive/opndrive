'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import type { Credentials } from '@opndrive/s3-api';
import { useAuth } from '@/hooks/use-auth';
import { Button, Combobox, SecretInput } from '@/shared/components/ui';
import { type S3Provider, resolveEndpoint } from '@/config/providers';
import { failureFrom, type ConnectionFailure } from '@/lib/s3/connection-failure';

interface ConnectWizardProps {
  provider: S3Provider;
}

export interface ConnectFormState {
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region: string;
  prefix: string;
  endpoint: string;
}

/**
 * Turns the free-text prefix into an S3 key prefix.
 *
 * Users type folder names however they like, so this normalises whitespace and
 * commas into slash-delimited segments with a trailing slash, which is what S3
 * treats as a folder.
 */
export function formatPrefix(value: string): string {
  if (!value || value.trim() === '') return '';

  const parts = value
    .replace(/\//g, '')
    .split(/[\s,]+/)
    .filter((part) => part.trim() !== '');

  return parts.length > 0 ? `${parts.join('/')}/` : '';
}

/** Builds the credentials the S3 client expects from what the user typed. */
export function buildCredentials(provider: S3Provider, form: ConnectFormState): Credentials {
  const endpoint = form.endpoint || resolveEndpoint(provider, form.region);

  return {
    accessKeyId: form.accessKeyId,
    secretAccessKey: form.secretAccessKey,
    bucketName: form.bucketName,
    prefix: formatPrefix(form.prefix),
    region: form.region,
    ...(endpoint && endpoint.trim() && { endpoint: endpoint.trim() }),
  };
}

const FIELD =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary';

const LABEL = 'block text-sm font-medium text-foreground';

const HINT = 'text-xs leading-relaxed text-muted-foreground';

export function ConnectWizard({ provider }: ConnectWizardProps) {
  const router = useRouter();
  const { createSession } = useAuth();

  const [form, setForm] = useState<ConnectFormState>({
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    region: provider.defaultRegion,
    prefix: '',
    endpoint: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [failure, setFailure] = useState<ConnectionFailure | null>(null);

  const update = (patch: Partial<ConnectFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const missingEndpoint = provider.requiresCustomEndpoint && !form.endpoint.trim();
  const incomplete =
    !form.accessKeyId.trim() || !form.secretAccessKey.trim() || !form.bucketName.trim();

  // Not `${provider.name} needs an endpoint`, which the catch-all turned into
  // "Custom endpoint needs an endpoint". Naming the provider was redundant
  // anyway on a page that is already about one provider.
  const blockedReason = missingEndpoint
    ? 'Add the endpoint URL above'
    : incomplete
      ? 'Fill in the key, secret and bucket'
      : null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (blockedReason) return;

    setIsLoading(true);
    setFailure(null);

    try {
      await createSession(buildCredentials(provider, form));
      router.push('/dashboard');
    } catch (caught) {
      console.error('Failed to create session:', caught);

      // Named rather than assumed. This said "those credentials did not work"
      // whatever had happened, so a missing CORS rule or a mistyped region sent
      // people back to re-check keys that were fine.
      setFailure(failureFrom(caught));
    } finally {
      setIsLoading(false);
    }
  };

  const derivedEndpoint = resolveEndpoint(provider, form.region);

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        {/* The two secrets sit together, above everything that merely locates
            the bucket, because they are the part people arrive holding. */}
        <div className="space-y-4 rounded-xl bg-surface-sunken p-4">
          <div className="space-y-1.5">
            <label htmlFor="access-key-id" className={LABEL}>
              Access key ID
            </label>
            <input
              id="access-key-id"
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              className={FIELD}
              value={form.accessKeyId}
              onChange={(event) => update({ accessKeyId: event.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="secret-access-key" className={LABEL}>
              Secret access key
            </label>
            <SecretInput
              id="secret-access-key"
              label="secret access key"
              required
              value={form.secretAccessKey}
              onChange={(value) => update({ secretAccessKey: value })}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="bucket-name" className={LABEL}>
              Bucket name
            </label>
            <input
              id="bucket-name"
              type="text"
              required
              spellCheck={false}
              className={FIELD}
              placeholder="my-bucket"
              value={form.bucketName}
              onChange={(event) => update({ bucketName: event.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="region" className={LABEL}>
              Region
            </label>
            <Combobox
              id="region"
              label="Region"
              options={provider.regions}
              value={form.region}
              onChange={(value) => update({ region: value })}
              placeholder={`Select a ${provider.name} region`}
              allowCustomValue
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="endpoint" className={LABEL}>
            Endpoint{' '}
            {!provider.requiresCustomEndpoint && (
              <span className="font-normal text-muted-foreground">(optional)</span>
            )}
          </label>
          <input
            id="endpoint"
            type="text"
            required={provider.requiresCustomEndpoint}
            spellCheck={false}
            className={FIELD}
            placeholder={provider.endpointPlaceholder ?? 'https://storage.example.com'}
            value={form.endpoint}
            onChange={(event) => update({ endpoint: event.target.value })}
          />
          {!form.endpoint && derivedEndpoint && (
            <p className={HINT}>
              Defaults to <code className="text-foreground">{derivedEndpoint}</code>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="prefix" className={LABEL}>
            Folder prefix <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="prefix"
            type="text"
            spellCheck={false}
            className={FIELD}
            placeholder="projects documents"
            value={form.prefix}
            onChange={(event) => update({ prefix: event.target.value })}
          />
          {form.prefix && (
            <p className={HINT}>
              Opens at <code className="text-foreground">{formatPrefix(form.prefix)}</code>
            </p>
          )}
        </div>

        {failure && (
          <div
            role="alert"
            className="rounded-lg border border-destructive-border bg-destructive-surface px-3 py-2.5"
          >
            <p className="text-sm font-medium text-destructive">{failure.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{failure.detail}</p>
          </div>
        )}
      </div>

      {/*
        Sticky so the commit action is always reachable. The form is taller than
        a phone viewport, and scrolling back up to find the button is the main
        friction point at this length.

        z-40 keeps it under the combobox panel at z-50, so an open region list
        paints over the bar rather than being clipped behind it.
      */}
      <div className="sticky bottom-0 z-40 -mx-5 mt-5 border-t border-border bg-card/95 px-5 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <Button
          type="submit"
          className="h-11 w-full"
          disabled={isLoading || Boolean(blockedReason)}
        >
          {isLoading ? 'Connecting...' : 'Connect to your S3 storage'}
        </Button>

        <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          {blockedReason ? (
            blockedReason
          ) : (
            <>
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Your keys stay in this browser and are never sent to us
            </>
          )}
        </p>
      </div>
    </form>
  );
}
