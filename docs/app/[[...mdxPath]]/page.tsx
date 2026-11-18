import type { Metadata } from 'next';
import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { isHomePage, pageMetadata } from '@/lib/site';
import { breadcrumbJsonLd, jsonLdScript, websiteJsonLd } from '@/lib/structured-data';
import { useMDXComponents as getMDXComponents } from '../../mdx-components';

export const generateStaticParams = generateStaticParamsFor('mdxPath');

export async function generateMetadata(props: {
  params: Promise<{ mdxPath?: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath);
  return pageMetadata(metadata, params.mdxPath);
}

const Wrapper = getMDXComponents().wrapper as React.ComponentType<{
  toc: unknown;
  metadata: unknown;
  children: React.ReactNode;
}>;

export default async function Page(props: { params: Promise<{ mdxPath?: string[] }> }) {
  const params = await props.params;
  const result = await importPage(params.mdxPath);
  const { default: MDXContent, toc, metadata } = result;
  // The home names the site; every other page says where it sits. The same
  // home test pageMetadata uses, so the two cannot disagree.
  const structuredData = isHomePage(params.mdxPath)
    ? websiteJsonLd()
    : await breadcrumbJsonLd(params.mdxPath);

  return (
    <Wrapper toc={toc} metadata={metadata}>
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
        />
      )}
      <MDXContent {...props} params={params} />
    </Wrapper>
  );
}
