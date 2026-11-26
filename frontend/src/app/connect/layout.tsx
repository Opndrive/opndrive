import { PublicPolicyReload } from '@/components/privacy/public-policy-reload';

/**
 * The connect pages test the user's storage credentials, so they need the
 * app's security policy. PublicPolicyReload loads them again under it when
 * they were reached from a public page without a new document.
 */
export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicPolicyReload />
      {children}
    </>
  );
}
