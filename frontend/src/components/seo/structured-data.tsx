import { serializeJsonLd } from '@/lib/seo/json-ld';

/**
 * Structured Data Component
 * Renders JSON-LD structured data for SEO. Blog titles and excerpts come from
 * WordPress, so the JSON is serialized with `<` escaped (see serializeJsonLd).
 */

interface StructuredDataProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

export function StructuredData({ data }: StructuredDataProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: serializeJsonLd(data),
      }}
    />
  );
}
