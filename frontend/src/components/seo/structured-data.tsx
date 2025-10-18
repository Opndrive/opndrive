/**
 * Structured Data Component
 * Renders JSON-LD structured data for SEO
 */

interface StructuredDataProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

export function StructuredData({ data }: StructuredDataProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data, null, 0),
      }}
    />
  );
}
