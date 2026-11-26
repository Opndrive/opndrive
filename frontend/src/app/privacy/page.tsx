import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalHighlight, LegalLayout, LegalSection } from '@/components/legal/legal-layout';
import { AnalyticsOptOut } from '@/components/privacy/analytics-opt-out';
import { storageKeysForPolicy } from '@/lib/privacy/storage-keys';
import { ANALYTICS_EVENTS, ANALYTICS_FIELDS } from '@/lib/analytics/analytics-fields';
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
    'What Opndrive collects, what it does not, and what is stored in your browser. The app collects nothing, self-hosted copies collect nothing, and your files never reach our servers.',
  alternates: { canonical: '/privacy' },
};

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
            The Opndrive app, the pages where you connect storage and work with your files, collects
            nothing. Your keys and files go only between your browser and your storage provider.
            Self-hosted copies of Opndrive collect nothing and send nothing to us.
          </p>
          <p className="mt-3">
            On our public pages (the home page, the blog and {HOSTED_DOCS_DOMAIN}) we count visits
            with PostHog. We use no cookies, store nothing on your device, and use no ID that
            outlives the page. If your browser sends Do Not Track or Global Privacy Control, those
            pages send nothing at all. There is no Opndrive account, so we hold no name, email
            address or password, and nothing is sold or shared.
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
          <li>
            Anything at all from the app itself: the connect pages, the dashboard and file previews
            send no analytics.
          </li>
          <li>Anything used for advertising, retargeting or profiling.</li>
          <li>
            Session recordings, heatmaps, or any click other than the links listed in section 6.
          </li>
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
            actually need, rotated periodically. On a shared machine, use Clear Session in the
            profile menu rather than just closing the tab: it removes every saved connection and its
            keys from this browser.
          </p>
        </LegalHighlight>
      </LegalSection>

      <LegalSection id="storage" heading="5. What is stored on your device">
        <p>
          Everything below is first-party, stays on your device, and is never sent to us or used to
          identify you. Each entry exists to deliver something you asked the app to do, which is why
          none of it requires a consent banner.
        </p>
        <p>
          Only one of them is a cookie, and it is written <strong>only if you opt out</strong> of
          analytics, to record that choice. Take no action and Opndrive sets no cookie at all.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 font-medium text-foreground">Name</th>
                <th className="px-4 py-3 font-medium text-foreground">Kind</th>
                <th className="px-4 py-3 font-medium text-foreground">What it is for</th>
                <th className="px-4 py-3 font-medium text-foreground">How long it lasts</th>
              </tr>
            </thead>
            <tbody>
              {storageKeysForPolicy().map((entry) => (
                <tr key={entry.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 align-top">
                    <code className="text-xs text-foreground">
                      {entry.key}
                      {entry.hasDynamicSuffix ? '...' : ''}
                    </code>
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    {entry.mechanisms.join(', ')}
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
          documentation site stores one value of its own, the light or dark theme you picked.
        </p>
      </LegalSection>

      <LegalSection id="collected" heading="6. What the public pages send">
        <p>
          The home page, the blog and the documentation send a short message to PostHog, our
          analytics service, when a page is opened and when one of a few links is followed. Nothing
          else on the page is watched, and the app pages send nothing at all. This is the complete
          list.
        </p>
        <p>The events:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          {ANALYTICS_EVENTS.map((event) => (
            <li key={event.name}>{event.description}</li>
          ))}
        </ul>
        <p>What each one carries:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          {ANALYTICS_FIELDS.map((field) => (
            <li key={field.label}>
              <strong>{field.label}.</strong> {field.description}
            </li>
          ))}
        </ul>
        <p>
          Like any request on the internet, each message also carries your IP address. PostHog is
          set to discard it and to look up no location. No cookie is set and nothing is written to
          your device, so the next time you visit, you are a new visitor to us.
        </p>
        <p>
          Nothing is sent if your browser sends Do Not Track or Global Privacy Control, if you turn
          analytics off below, or if you block the request, which we do not try to work around.
        </p>
        <p>
          Two other things happen on these pages. Our host keeps standard server logs containing IP
          addresses and browser user agents, as any web server does, which we use to keep the
          service running and to investigate abuse. And pictures inside blog posts load from the
          server that hosts our blog content. The GitHub star count is fetched by our server, not by
          your browser.
        </p>
        <p>You can turn analytics off here, and the choice applies to both sites:</p>
        <AnalyticsOptOut />
      </LegalSection>

      <LegalSection id="third-parties" heading="7. Third-party services">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Vercel</strong> hosts both sites.
          </li>
          <li>
            <strong>PostHog</strong>, in the United States, receives the analytics described in
            section 6, from the public pages only.
          </li>
          <li>
            <strong>GitHub</strong> hosts our source code and issue tracker. Our server asks it for
            the public star count; your browser does not.
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
          of the GDPR to measure how the public pages are used and to keep the site secure. That
          measurement is cookieless, keeps no ID beyond a page load and is not used to profile
          anyone, which is why it does not ask for consent. You can object to it at any time using
          the opt-out described above, and a Do Not Track or Global Privacy Control signal is
          honoured as an objection.
        </p>
        <p>
          Storage on your device is limited to what is strictly necessary to provide the features
          you asked for, so it is exempt from the consent requirement in Article 5(3) of the
          ePrivacy Directive.
        </p>
      </LegalSection>

      <LegalSection id="retention" heading="9. How long we keep things">
        <p>
          Analytics events are kept in PostHog, without IP addresses, for the retention period of
          our plan. Server logs are short-lived and kept only for operational and security purposes.
          Your credentials and saved connections stay in your browser until you use Clear Session or
          clear its site data. Your preferences stay until you clear them.
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
          <li>
            Analytics events hold no IP address and no ID that lasts beyond a page load, so they
            cannot be traced back to you.
          </li>
        </ul>
        <p>
          If you are in the EU or UK and think we have handled your data badly, you may complain to
          your national data protection authority. Californian residents have rights under the CCPA,
          though we do not sell or share personal information, so there is nothing to opt out of.
        </p>
      </LegalSection>

      <LegalSection id="transfers" heading="11. International transfers">
        <p>
          Our host and PostHog process data in the United States, among other places. Where personal
          data leaves the UK or the EEA, it is covered by the Standard Contractual Clauses in our
          agreements with those providers.
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
            It sends no analytics. Analytics is only built in when the build is given an analytics
            key and host, and only our own deployment is. A build without them, including our Docker
            image, contains no analytics code and makes no request to any analytics service.
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
