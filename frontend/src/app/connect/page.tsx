import type { Metadata } from 'next';
import Link from 'next/link';
import { ISSUES_URL } from '@/config/links';
import { S3_PROVIDERS } from '@/config/providers';
import { ConnectShell } from '@/features/connect/components/connect-shell';
import { ProviderPicker } from '@/features/connect/components/provider-picker';
import { WizardSection } from '@/features/connect/components/wizard-section';

/**
 * The hub. Targets the unbranded intent, and links to every provider page so
 * they are reachable by a crawler rather than only present in the sitemap.
 *
 * A server component on purpose: metadata cannot be exported from a file marked
 * 'use client', and this page has no interactivity of its own. The picker is a
 * set of links, so it does not need to be one either.
 */
export const metadata: Metadata = {
  title: 'Connect Your S3 Bucket - Browser Client for S3 Storage',
  description:
    'Connect Opndrive to Amazon S3, Cloudflare R2, Wasabi, Backblaze B2, MinIO or any S3-compatible endpoint. Your keys stay in your browser and your files never touch our servers.',
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
      currentStep={1}
      title="Connect your storage"
      subtitle="Opndrive is a browser client for storage you already own. Nothing is uploaded to us, and there is no account to create."
      notice="Your access keys stay in this browser. Every request goes straight from here to your provider."
    >
      <div className="rounded-2xl border border-border bg-card px-5 shadow-sm sm:px-6">
        <WizardSection index={1} title="Choose a provider" state="active">
          <ProviderPicker providers={S3_PROVIDERS} />

          {/*
            This used to point at /connect/minio, which sent anyone on
            DigitalOcean or Scaleway to a page about self-hosting MinIO. There
            is a real catch-all provider now, and this links to it.
          */}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Using something else? Any S3-compatible service works.{' '}
            <Link href="/connect/custom-endpoint" className="text-primary hover:underline">
              Set it up as a custom endpoint
            </Link>
            .
          </p>

          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            If you would like a provider listed here with its own setup guide,{' '}
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              open an issue on GitHub
            </a>{' '}
            and tell us which one.
          </p>
        </WizardSection>

        <WizardSection index={2} title="Add credentials" state="locked" />

        <WizardSection index={3} title="Open your drive" state="locked" />
      </div>
    </ConnectShell>
  );
}
