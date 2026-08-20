'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import type { Credentials } from '@opndrive/s3-api';
import { useAuth } from '@/hooks/use-auth';
import { Button, Combobox, SecretInput } from '@/shared/components/ui';
import { type S3Provider, resolveEndpoint } from '@/config/providers';
import { ProviderMark } from './provider-mark';
import { SetupGuide } from './setup-guide';

interface ConnectWizardProps {
  provider: S3Provider;
  corsConfig: string;
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
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary';

const LABEL = 'text-sm font-medium text-foreground';

export function ConnectWizard({ provider, corsConfig }: ConnectWizardProps) {
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
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<ConnectFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const missingEndpoint = provider.requiresCustomEndpoint && !form.endpoint.trim();
  const incomplete =
    !form.accessKeyId.trim() || !form.secretAccessKey.trim() || !form.bucketName.trim();

  const blockedReason = missingEndpoint
    ? `${provider.name} needs an endpoint`
    : incomplete
      ? 'Fill in the key, secret and bucket'
      : null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (blockedReason) return;

    setIsLoading(true);
    setError(null);

    try {
      await createSession(buildCredentials(provider, form));
      router.push('/dashboard');
    } catch (caught) {
      console.error('Failed to create session:', caught);
      setError('Those credentials did not work. Check the key, bucket and region, then try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const derivedEndpoint = resolveEndpoint(provider, form.region);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card shadow-sm">
        {/* Which provider this card is for, and a way back to the picker. */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <ProviderMark provider={provider} size={38} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{provider.name}</p>
            <p className="truncate text-xs text-muted-foreground">{provider.tagline}</p>
          </div>
          <Link
            href="/connect"
            className="flex-shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Change
          </Link>
        </div>

        <div className="space-y-4 px-5 py-5">
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
              placeholder={provider.endpoint || 'https://storage.example.com'}
              value={form.endpoint}
              onChange={(event) => update({ endpoint: event.target.value })}
            />
            {!form.endpoint && derivedEndpoint && (
              <p className="text-xs text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
                Opens at <code className="text-foreground">{formatPrefix(form.prefix)}</code>
              </p>
            )}
          </div>

          {error && (
            // `text-destructive` is used elsewhere in the app but no such token
            // is defined in globals.css, so those usages render in the
            // inherited colour. Using the palette directly, as notification does.
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        {/*
          Sticky so the commit action is always reachable. The form is longer
          than a phone viewport, and scrolling back up to find the button is the
          main friction point on a form this size.

          z-40 keeps it under the combobox panel at z-50, so an open region list
          paints over the bar rather than being clipped behind it.
        */}
        <div className="sticky bottom-0 z-40 space-y-2.5 rounded-b-2xl border-t border-border bg-card/95 px-5 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <Button
            type="submit"
            className="h-11 w-full"
            disabled={isLoading || Boolean(blockedReason)}
          >
            {isLoading ? 'Connecting...' : 'Connect to your S3 storage'}
          </Button>

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            {blockedReason ? (
              blockedReason
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                Your keys stay in this browser and are never sent to us
              </>
            )}
          </p>
        </div>
      </form>

      <SetupGuide provider={provider} corsConfig={corsConfig} />
    </div>
  );
}
