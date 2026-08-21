import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalHighlight, LegalLayout, LegalSection } from '@/components/legal/legal-layout';
import {
  HOSTED_APP_DOMAIN,
  HOSTED_DOCS_DOMAIN,
  LICENSE_NAME,
  LICENSE_URL,
  PRIVACY_CONTACT_EMAIL,
  REPOSITORY_URL,
} from '@/config/legal';

export const metadata: Metadata = {
  title: 'Terms of Service - Opndrive',
  description:
    'The terms covering the hosted Opndrive service. The software itself is open source under AGPL-3.0.',
  alternates: { canonical: '/terms' },
};

export default function TermsOfServicePage() {
  return (
    <LegalLayout
      title="Terms of Service"
      summary={`The terms for using the hosted service at ${HOSTED_APP_DOMAIN}. The software itself is open source and covered by its licence, not by this page.`}
    >
      <LegalSection id="scope" heading="1. What these terms cover">
        <p>
          These terms apply to the hosted Opndrive service at {HOSTED_APP_DOMAIN} and the
          documentation at {HOSTED_DOCS_DOMAIN}. Using either means you accept them.
        </p>
        <p>
          The Opndrive <em>software</em> is a separate matter. It is open source under{' '}
          <a
            href={LICENSE_URL}
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {LICENSE_NAME}
          </a>
          , and that licence, not this page, governs what you may do with the code.
        </p>
      </LegalSection>

      <LegalSection id="service" heading="2. What the service is">
        <p>
          Opndrive is a web interface to storage <strong>you already own</strong>. We provide the
          interface. You provide the storage, the credentials and everything kept in it.
        </p>
        <p>
          Because your browser talks to your storage provider directly, we do not host, receive,
          back up or have any ability to recover your files. If you delete something through
          Opndrive, it is deleted in your bucket, and only your provider can help you get it back.
        </p>
      </LegalSection>

      <LegalSection id="your-responsibilities" heading="3. Your responsibilities">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Your storage account is yours. You are responsible for its configuration, its security
            and every charge it incurs, including charges from requests Opndrive makes on your
            behalf.
          </li>
          <li>
            You are responsible for the content you store and for having the right to store it.
          </li>
          <li>
            Keep your credentials safe. We recommend keys scoped to a single bucket with only the
            permissions you need.
          </li>
          <li>
            Do not use the service to break the law, to infringe anybody&rsquo;s rights, or to
            attack, overload or interfere with our infrastructure or anyone else&rsquo;s.
          </li>
        </ul>
        <LegalHighlight>
          <p>
            Operations like search, listing and bulk transfers make real API requests to your
            provider, and providers bill for those. The costs are yours, and you should understand
            your provider&rsquo;s pricing before running large operations.
          </p>
        </LegalHighlight>
      </LegalSection>

      <LegalSection id="availability" heading="4. Availability">
        <p>
          The hosted service is offered free of charge and with no service level agreement. We may
          change, suspend or discontinue any part of it, at any time, without notice.
        </p>
        <p>
          Because Opndrive is open source, you are never locked in: you can run your own instance
          from the{' '}
          <a
            href={REPOSITORY_URL}
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            source
          </a>{' '}
          and keep working with the same buckets.
        </p>
      </LegalSection>

      <LegalSection id="warranty" heading="5. No warranty">
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
          warranties of any kind, whether express or implied, including any implied warranty of
          merchantability, fitness for a particular purpose or non-infringement.
        </p>
      </LegalSection>

      <LegalSection id="liability" heading="6. Limitation of liability">
        <p>
          To the fullest extent the law allows, the Opndrive maintainers are not liable for any
          indirect, incidental, special or consequential damages, nor for lost profits, lost data,
          or storage provider charges, arising from your use of the service.
        </p>
        <p>
          Nothing here limits liability that cannot be limited by law, and if you are a consumer,
          your statutory rights are unaffected.
        </p>
      </LegalSection>

      <LegalSection id="termination" heading="7. Ending your use">
        <p>
          Stop whenever you like. Using Disconnect removes your credentials from your browser, and
          since we hold no account there is nothing else to close.
        </p>
        <p>
          We may block access to the hosted service where it is being used to attack our
          infrastructure or in breach of these terms.
        </p>
      </LegalSection>

      <LegalSection id="privacy" heading="8. Privacy">
        <p>
          What we collect and what we do not is set out in the{' '}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
          , which forms part of these terms.
        </p>
      </LegalSection>

      <LegalSection id="changes" heading="9. Changes">
        <p>
          These terms may change. The date at the top reflects the last revision, and every change
          is a public commit in our repository. Continuing to use the service after a change means
          you accept the revised terms.
        </p>
      </LegalSection>

      <LegalSection id="contact" heading="10. Contact">
        <p>
          Questions about these terms can go to{' '}
          <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="text-primary hover:underline">
            {PRIVACY_CONTACT_EMAIL}
          </a>{' '}
          or to our{' '}
          <a
            href={`${REPOSITORY_URL}/issues`}
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            issue tracker
          </a>
          .
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
