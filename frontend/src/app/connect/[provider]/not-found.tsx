import { S3_PROVIDERS } from '@/config/providers';
import { ConnectShell } from '@/features/connect/components/connect-shell';
import { ProviderPicker } from '@/features/connect/components/provider-picker';
import { WizardSection } from '@/features/connect/components/wizard-section';

/**
 * Shown for a slug we do not recognise. Returns a real 404 status, so a typo
 * never becomes an indexable soft-404 competing with the pages we do want
 * ranked.
 *
 * Rather than a dead end, it drops the visitor back into step one with the
 * list in front of them.
 */
export default function ProviderNotFound() {
  return (
    <ConnectShell
      currentStep={1}
      title="We do not have that provider"
      subtitle="It may be spelled differently, or we may not support it yet. Any S3-compatible service still works through a custom endpoint."
      backHref="/connect"
      backLabel="All providers"
    >
      <div className="rounded-2xl border border-border bg-card px-5 shadow-sm sm:px-6">
        <WizardSection index={1} title="Choose a provider" state="active">
          <ProviderPicker providers={S3_PROVIDERS} />
        </WizardSection>

        <WizardSection index={2} title="Add credentials" state="locked" />

        <WizardSection index={3} title="Open your drive" state="locked" />
      </div>
    </ConnectShell>
  );
}
