'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Credentials } from '@opndrive/s3-api';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/shared/components/ui';
import { type S3Provider, resolveEndpoint } from '@/config/providers';

interface ConnectWizardProps {
  provider: S3Provider;
  /** Rendered by the setup guide. Passed in so this stays presentation-only. */
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

/** Builds the credentials the S3 provider expects from what the user typed. */
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
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<ConnectFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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

  const field =
    'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">Access key ID</span>
        <input
          type="text"
          required
          autoComplete="off"
          className={field}
          value={form.accessKeyId}
          onChange={(event) => update({ accessKeyId: event.target.value })}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">Secret access key</span>
        <input
          type="password"
          required
          autoComplete="off"
          className={field}
          value={form.secretAccessKey}
          onChange={(event) => update({ secretAccessKey: event.target.value })}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">Bucket name</span>
        <input
          type="text"
          required
          className={field}
          value={form.bucketName}
          onChange={(event) => update({ bucketName: event.target.value })}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">Region</span>
        <input
          type="text"
          required
          className={field}
          value={form.region}
          onChange={(event) => update({ region: event.target.value })}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">Endpoint</span>
        <input
          type="text"
          required={provider.requiresCustomEndpoint}
          className={field}
          placeholder={provider.endpoint || 'https://your-server.example.com'}
          value={form.endpoint}
          onChange={(event) => update({ endpoint: event.target.value })}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">Folder prefix (optional)</span>
        <input
          type="text"
          className={field}
          placeholder="projects documents"
          value={form.prefix}
          onChange={(event) => update({ prefix: event.target.value })}
        />
      </label>

      {/* `text-destructive` is used elsewhere in the app but no such token is
          defined in globals.css, so those usages render in the inherited
          colour. Using the palette directly, as notification.tsx does. */}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Connecting...' : 'Connect to your S3 storage'}
      </Button>
    </form>
  );
}
