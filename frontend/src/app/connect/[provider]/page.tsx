import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PROVIDER_SLUGS, getProviderBySlug } from '@/config/providers';
import { getCorsConfig } from '@/config/cors';
import { ConnectShell } from '@/features/connect/components/connect-shell';
import { ConnectWizard } from '@/features/connect/components/connect-wizard';

interface ProviderPageProps {
  params: Promise<{ provider: string }>;
}

/**
 * The five provider slugs, known at build time.
 *
 * Anything outside this list must 404 rather than falling back to the hub.
 * A soft fallback would turn every typo into an indexable near-duplicate of
 * this page, which is exactly the duplicate-content problem the per-provider
 * canonicals below exist to avoid.
 */
export function generateStaticParams() {
  return PROVIDER_SLUGS.map((provider) => ({ provider }));
}

export async function generateMetadata({ params }: ProviderPageProps): Promise<Metadata> {
  const { provider: slug } = await params;
  const provider = getProviderBySlug(slug);

  if (!provider) return {};

  const path = `/connect/${provider.slug}`;

  return {
    title: provider.seo.title,
    description: provider.seo.description,
    // Self-canonicalising. Derived from the slug rather than hard-coded, so a
    // new provider cannot accidentally inherit another one's canonical.
    alternates: { canonical: path },
    openGraph: {
      title: provider.seo.title,
      description: provider.seo.description,
      url: path,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: provider.seo.title,
      description: provider.seo.description,
    },
  };
}

export default async function ProviderConnectPage({ params }: ProviderPageProps) {
  const { provider: slug } = await params;
  const provider = getProviderBySlug(slug);

  if (!provider) notFound();

  return (
    <ConnectShell
      eyebrow="Step 2 of 2"
      title={provider.seo.h1}
      subtitle={provider.seo.intro}
      backHref="/connect"
      backLabel="All providers"
    >
      <ConnectWizard provider={provider} corsConfig={getCorsConfig(provider.id)} />
    </ConnectShell>
  );
}
