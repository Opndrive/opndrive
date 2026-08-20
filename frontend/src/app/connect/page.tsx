import type { Metadata } from 'next';
import { S3_PROVIDERS } from '@/config/providers';
import { ConnectShell } from '@/features/connect/components/connect-shell';
import { ProviderPicker } from '@/features/connect/components/provider-picker';

/**
 * The hub. Targets the unbranded intent, and links to every provider page so
 * they are reachable by a crawler rather than only present in the sitemap.
 *
 * A server component on purpose: metadata cannot be exported from a file marked
 * 'use client', and this page has no interactivity of its own. The picker is
 * a set of links, so it does not need to be one either.
 */
export const metadata: Metadata = {
  title: 'Connect Your S3 Bucket - Browser Client for S3 Storage',
  description:
    'Connect Opndrive to Amazon S3, Cloudflare R2, Wasabi, Backblaze B2 or MinIO. Your keys stay in your browser and your files never touch our servers.',
  alternates: { canonical: '/connect' },
  openGraph: {
    title: 'Connect Your S3 Bucket - Opndrive',
    description:
      'A browser client for S3-compatible storage. Bring your own bucket, keep your own keys.',
    url: '/connect',
    type: 'website',
  },
};

export default function ConnectHubPage() {
  return (
    <ConnectShell
      eyebrow="Step 1 of 2"
      title="Where is your storage?"
      subtitle="Pick a provider to get setup instructions written for it. Your credentials stay in this browser and are never sent to us."
    >
      <ProviderPicker providers={S3_PROVIDERS} />
    </ConnectShell>
  );
}
