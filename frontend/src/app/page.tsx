import { headers } from 'next/headers';
import LandingPage from '@/features/landing-page/components/landing-page';
import { faqData } from '@/features/landing-page/config/faq-section';

/**
 * A server shell around the landing page, which is a client component and so
 * cannot do either of the two things below.
 *
 * The FAQ structured data is built from the same `faqData` the section renders,
 * because Google requires the markup to describe what a visitor can actually
 * see - generating both from one array is what keeps that true when a question
 * is edited. And the nonce, which every inline script here carries, can only be
 * read on the server.
 *
 * The route was already server-rendered on demand before this - the root layout
 * reads `headers()` - so the shell costs nothing it was not already paying.
 */
export default async function Page() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqData.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: { '@type': 'Answer', text: item.answer },
            })),
          }),
        }}
      />
      <LandingPage />
    </>
  );
}
