import type { Metadata } from 'next';
import { generateStaticParamsFor, importPage } from 'nextra/pages';
import { BASE_OPEN_GRAPH, pageUrl } from '@/lib/site';
import { breadcrumbJsonLd, jsonLdScript, websiteJsonLd } from '@/lib/structured-data';
import { useMDXComponents as getMDXComponents } from '../../mdx-components';

export const generateStaticParams = generateStaticParamsFor('mdxPath');

export async function generateMetadata(props: {
  params: Promise<{ mdxPath?: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const { metadata } = await importPage(params.mdxPath);
  const url = pageUrl(params.mdxPath);
  const isHome = !params.mdxPath?.some(Boolean);

  return {
    ...metadata,
    // The home page's own title already names the product, so the layout's
    // "%s - Opndrive Docs" template would only say it twice.
    ...(isHome && { title: { absolute: metadata.title } }),
    alternates: { canonical: url },
    // Restates the shared fields: setting openGraph here replaces the
    // layout's rather than adding to it.
    openGraph: { ...BASE_OPEN_GRAPH, url },
  };
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
  const isHome = !params.mdxPath?.some(Boolean);
  // The home names the site; every other page says where it sits.
  const structuredData = isHome ? websiteJsonLd() : await breadcrumbJsonLd(params.mdxPath);

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
