import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PROVIDER_SLUGS, getProviderBySlug } from '@/config/providers';
import { getCorsConfig } from '@/config/cors';
import { ConnectShell } from '@/features/connect/components/connect-shell';
import { ConnectWizard } from '@/features/connect/components/connect-wizard';
import { ProviderMark } from '@/features/connect/components/provider-mark';
import { SetupGuide } from '@/features/connect/components/setup-guide';
import { WizardSection } from '@/features/connect/components/wizard-section';

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
      currentStep={2}
      title={provider.seo.h1}
      subtitle={provider.seo.intro}
      backHref="/connect"
      backLabel="All providers"
    >
      <div className="rounded-2xl border border-border bg-card px-5 shadow-sm sm:px-6">
        {/* Step one is already answered by the route, so it shows its answer
            rather than the list, with a way back to change it. */}
        <WizardSection index={1} title="Provider" state="complete" summary="Selected">
          <div className="flex items-center gap-3 rounded-xl bg-surface-sunken px-4 py-3">
            <ProviderMark provider={provider} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{provider.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {provider.tagline}
              </span>
            </span>
            <Link
              href="/connect"
              className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:underline"
            >
              Change
            </Link>
          </div>
        </WizardSection>

        <WizardSection index={2} title="Add credentials" state="active">
          <ConnectWizard provider={provider} />
        </WizardSection>

        <WizardSection index={3} title="Open your drive" state="locked" />
      </div>

      <div className="mt-4">
        <SetupGuide provider={provider} corsConfig={getCorsConfig(provider.id)} />
      </div>
    </ConnectShell>
  );
}
