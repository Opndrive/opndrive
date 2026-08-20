import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalHighlight, LegalLayout, LegalSection } from '@/components/legal/legal-layout';
import { AnalyticsOptOut } from '@/components/privacy/analytics-opt-out';
import {
  HOSTED_APP_DOMAIN,
  HOSTED_DOCS_DOMAIN,
  PRIVACY_CONTACT_EMAIL,
  REPOSITORY_URL,
  SECURITY_ADVISORY_URL,
} from '@/config/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy - Opndrive',
  description:
    'What Opndrive collects, what it does not, and what is stored in your browser. No accounts, no trackers, and your files never reach our servers.',
  alternates: { canonical: '/privacy' },
};

/**
 * Every key the app writes to the browser, with why and for how long.
 *
 * This doubles as our cookie policy - there is no separate document to fall
 * out of step with it.
 */
const DEVICE_STORAGE = [
  {
    key: 's3_user_session',
    purpose: 'Your storage credentials, so a refresh does not sign you out',
    lifetime: 'Until you disconnect',
  },
  {
    key: 'ui-theme',
    purpose: 'Light, dark or system appearance',
    lifetime: 'Until you clear it',
  },
  {
    key: 'opndrive_user_settings',
    purpose: 'Start page, upload method and default sharing duration',
    lifetime: 'Until you clear it',
  },
  {
    key: 'opndrive-layout-preference',
    purpose: 'Grid or list view',
    lifetime: 'Until you clear it',
  },
  {
    key: 'delete-recovery-storage',
    purpose: 'Lets an interrupted delete be recovered. Holds the names of the affected files',
    lifetime: 'Until the delete resolves',
  },
  {
    key: 'upload-settings-storage',
    purpose: 'Your upload preferences',
    lifetime: 'Until you clear it',
  },
  {
    key: 'sidebarOpen_global, sidebarOpen_settings',
    purpose: 'Whether the sidebar is open',
    lifetime: 'Until you clear it',
  },
  {
    key: 'opndrive-folder-rename-warning-dismissed and two similar keys',
    purpose: 'Remembers that you dismissed a confirmation notice',
    lifetime: 'Until you clear it',
  },
  {
    key: 'sidebar_discord_cta_dismissed',
    purpose: 'Remembers that you dismissed the community prompt',
    lifetime: 'Until you close the tab',
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      summary={`How the hosted Opndrive app at ${HOSTED_APP_DOMAIN} and the documentation at ${HOSTED_DOCS_DOMAIN} handle your data.`}
    >
      <LegalSection id="scope" heading="1. Who this covers">
        <p>
          This policy applies to the Opndrive service we operate: the app at {HOSTED_APP_DOMAIN} and
          the documentation at {HOSTED_DOCS_DOMAIN}.
        </p>
        <p>
          It does <strong>not</strong> apply to a copy of Opndrive that somebody else runs. Opndrive
          is open source software, and when you use somebody else&rsquo;s installation, they decide
          what happens to your data, not us. See{' '}
          <Link href="#self-hosting" className="text-primary hover:underline">
            self-hosting
          </Link>{' '}
          at the end.
        </p>
      </LegalSection>

      <LegalSection id="summary" heading="2. The short version">
        <LegalHighlight>
          <p>
            There is no Opndrive account, so we hold no name, email address or password. Your files
            go straight from your browser to your own storage provider, so we never receive them.
            Your storage credentials stay in your browser and are never sent to us. We count page
            views without cookies and without profiling you. Nothing is sold or shared.
          </p>
        </LegalHighlight>
      </LegalSection>

      <LegalSection id="not-collected" heading="3. What we do not collect">
        <p>Starting with the part that matters most. We do not collect:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Your name, email address, phone number or password. There is no sign-up.</li>
          <li>The contents of your files. They never pass through our servers.</li>
          <li>
            The names or paths of your files, which stay between your browser and your bucket.
          </li>
          <li>Your storage credentials.</li>
          <li>Anything used for advertising, retargeting, conversion tracking or profiling.</li>
          <li>Session recordings or heatmaps.</li>
        </ul>
        <p>We do not sell or share personal information, and we never have.</p>
      </LegalSection>

      <LegalSection id="credentials" heading="4. Your credentials and your files">
        <p>
          Opndrive connects to storage you already own. You supply your own S3-compatible
          credentials, and the app uses them to talk to your provider{' '}
          <strong>directly from your browser</strong>. There is no Opndrive server between the two,
          which is why we cannot see your files even if we wanted to.
        </p>
        <p>
          Those credentials are held in this browser, in <code>localStorage</code>, so that your
          session survives a page refresh. That has a consequence worth stating plainly: anything
          able to run JavaScript on the page, or anyone with access to your browser profile, could
          read them.
        </p>
        <LegalHighlight>
          <p>
            We recommend credentials scoped to a single bucket, with only the permissions you
            actually need, rotated periodically. Use Disconnect rather than just closing the tab
            when you are on a shared machine, which removes them from this browser.
          </p>
        </LegalHighlight>
      </LegalSection>

      <LegalSection id="storage" heading="5. What is stored on your device">
        <p>
          Opndrive sets <strong>no cookies</strong>. Everything below is first-party browser
          storage, it stays on your device, and none of it is sent to us or used to identify you.
          Every entry is needed for something you asked the app to do, which is why none of it
          requires a consent banner.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 font-medium text-foreground">Name</th>
                <th className="px-4 py-3 font-medium text-foreground">What it is for</th>
                <th className="px-4 py-3 font-medium text-foreground">How long it lasts</th>
              </tr>
            </thead>
            <tbody>
              {DEVICE_STORAGE.map((entry) => (
                <tr key={entry.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 align-top">
                    <code className="text-xs text-foreground">{entry.key}</code>
                  </td>
                  <td className="px-4 py-3 align-top">{entry.purpose}</td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">{entry.lifetime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Clearing site data for {HOSTED_APP_DOMAIN} in your browser removes all of it. The
          documentation site stores one value, the light or dark theme you picked.
        </p>
        <p>
          If you opt out of analytics we store one cookie, <code>opndrive_privacy</code>, recording
          that choice so we can honour it across both sites. It is written only if you actually opt
          out. Take no action and no cookie is ever set.
        </p>
      </LegalSection>

      <LegalSection id="collected" heading="6. What we collect when you visit">
        <p>
          We use Vercel Web Analytics and Vercel Speed Insights to see which pages are used and how
          quickly they load. Neither sets a cookie, neither stores anything on your device, and
          neither builds a profile of you or follows you to other sites.
        </p>
        <p>
          Page addresses are stripped before they are sent. Search terms and file paths are removed,
          so what is recorded is which page was opened, never what was in it. Our host also keeps
          standard server logs containing IP addresses and browser user agents, as any web server
          does, which we use to keep the service running and to investigate abuse.
        </p>
        <p>
          The landing page asks GitHub for our public star count, so GitHub sees the request. That
          is the only third party contacted by a page you have not chosen to visit.
        </p>
        <p>You can turn it off here, and the choice applies to both sites:</p>
        <AnalyticsOptOut />
      </LegalSection>

      <LegalSection id="third-parties" heading="7. Third-party services">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Vercel</strong> hosts both sites and provides the analytics described above.
          </li>
          <li>
            <strong>GitHub</strong> receives a request for our public star count when the landing
            page loads, and hosts our source code and issue tracker.
          </li>
          <li>
            <strong>Discord</strong> receives nothing unless you follow our invite link.
          </li>
          <li>
            <strong>Your own storage provider</strong>, whoever that is, receives your files and
            requests. They act for you, not for us, and their privacy terms apply to that data.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="legal-bases" heading="8. Legal bases">
        <p>
          For visitors in the UK and the EU, we rely on legitimate interests under Article 6(1)(f)
          of the GDPR to measure how the site is used and to keep it secure. That measurement is
          aggregate, cookieless and not used to profile anyone, which is why it does not ask for
          consent. You can object to it at any time using the opt-out described above.
        </p>
        <p>
          Storage on your device is limited to what is strictly necessary to provide the features
          you asked for, so it is exempt from the consent requirement in Article 5(3) of the
          ePrivacy Directive.
        </p>
      </LegalSection>

      <LegalSection id="retention" heading="9. How long we keep things">
        <p>
          Analytics data is aggregate and retained by our host on a rolling window. Server logs are
          short-lived and kept only for operational and security purposes. Anything stored in your
          browser stays until you clear it, or until you disconnect, whichever comes first.
        </p>
      </LegalSection>

      <LegalSection id="rights" heading="10. Your rights">
        <p>
          If the UK or EU GDPR applies to you, you have the right to access, correct, erase, export
          and restrict the processing of your personal data, and to object to it.
        </p>
        <p>
          There is an honest complication. Because we hold no account and no identifier for you, we
          usually <strong>cannot</strong> tell which data is yours, and Article 11 of the GDPR does
          not require us to collect more information just to be able to. In practice this means:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Everything we hold about you personally is in your own browser. Clearing site data for{' '}
            {HOSTED_APP_DOMAIN} erases it, immediately and completely.
          </li>
          <li>
            Your files are in your own storage account, so exporting or deleting them is entirely in
            your hands and does not involve us.
          </li>
          <li>Analytics data is aggregate and cannot be traced back to an individual.</li>
        </ul>
        <p>
          If you are in the EU or UK and think we have handled your data badly, you may complain to
          your national data protection authority. Californian residents have rights under the CCPA,
          though we do not sell or share personal information, so there is nothing to opt out of.
        </p>
      </LegalSection>

      <LegalSection id="transfers" heading="11. International transfers">
        <p>
          Our host operates globally and processes data in the United States among other places.
          Where personal data leaves the UK or the EEA, it is covered by the Standard Contractual
          Clauses in our agreement with that provider.
        </p>
      </LegalSection>

      <LegalSection id="children" heading="12. Children">
        <p>
          Opndrive is a developer tool and is not directed at children under 16. We do not knowingly
          collect anything from them.
        </p>
      </LegalSection>

      <LegalSection id="changes" heading="13. Changes to this policy">
        <p>
          The date at the top changes whenever this document does. Because Opndrive is open source,
          every revision is a public commit, so you can see exactly what changed and when in the{' '}
          <a
            href={`${REPOSITORY_URL}/commits/main/frontend/src/app/privacy/page.tsx`}
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            history of this page
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="14. Contact">
        <p>
          Privacy questions go to{' '}
          <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="text-primary hover:underline">
            {PRIVACY_CONTACT_EMAIL}
          </a>
          .
        </p>
        <p>
          Security issues should not go in a public issue. Please report them through our{' '}
          <a
            href={SECURITY_ADVISORY_URL}
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            security advisory form
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="self-hosting" heading="15. If you self-host Opndrive">
        <p>
          When you run Opndrive yourself, you are the data controller and this policy does not apply
          to your users. It is worth knowing what the software does on its own:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>It has no phone-home and reports nothing to us.</li>
          <li>
            The analytics components address a collector that only exists on Vercel&rsquo;s
            platform. Deployed anywhere else there is nothing behind that address, so no usage data
            is sent to anyone.
          </li>
          <li>It writes the browser storage listed in section 5 and sets no cookies.</li>
          <li>It talks only to the storage provider whose credentials the user supplies.</li>
        </ul>
        <p>
          You are welcome to copy this page as the starting point for your own policy. It is
          licensed with the rest of the project.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
