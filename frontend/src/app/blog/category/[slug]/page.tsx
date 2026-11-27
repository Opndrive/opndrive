import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import BlogNavbar from '@/components/blog/blog-navbar';
import { PostList } from '@/components/blog/post-list';
import { StructuredData } from '@/components/seo';
import { isBlogEnabled } from '@/config/features';
import { generateBreadcrumbSchema, generateCollectionPageSchema, getAbsoluteUrl } from '@/lib/seo';
import { pageSocialMetadata } from '@/lib/seo/social';
import { isWordPressConfigured } from '@/lib/wordpress/client';
import { getCategoryHub } from '@/lib/wordpress/service';
import { HUB_MIN_POSTS, descriptionFromText, hasHub, hubPath } from '@/lib/wordpress/seo-text';

/**
 * A topic's hub: the WordPress category's description as its introduction,
 * and its published posts, newest first.
 *
 * Only a topic with HUB_MIN_POSTS or more published posts has one. Below that
 * this answers 404, the sitemap leaves it out and no breadcrumb links to it,
 * so a thin page never exists. It appears by itself once WordPress counts
 * enough posts in the category.
 */

const loadHub = cache(async (slug: string) => {
  if (!isBlogEnabled() || !isWordPressConfigured()) return null;
  const hub = await getCategoryHub(slug);
  return hub && hasHub(hub) ? hub : null;
});

/** The introduction: the category's description, or a plain line about what is here. */
function introOf(hub: { name: string; description: string }): string {
  return (
    hub.description ||
    `Every Opndrive blog post on ${hub.name.toLowerCase()} for S3-compatible storage, newest first.`
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const hub = await loadHub(slug);
  if (!hub) return { title: 'Topic Not Found' };

  const path = hubPath(hub.slug);
  const title = `${hub.name}: S3 storage guides from the Opndrive blog`;
  const description = descriptionFromText(introOf(hub));

  return {
    title,
    description,
    alternates: { canonical: getAbsoluteUrl(path) },
    robots: { index: true, follow: true },
    ...pageSocialMetadata({ title, description, path }),
  };
}

export default async function CategoryHubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hub = await loadHub(slug);
  if (!hub || hub.posts.length < HUB_MIN_POSTS) notFound();

  const path = hubPath(hub.slug);

  return (
    <div className="min-h-screen bg-background">
      <StructuredData
        data={[
          generateCollectionPageSchema(hub, hub.posts),
          generateBreadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Blog', url: '/blog' },
            { name: hub.name, url: path },
          ]),
        ]}
      />

      <BlogNavbar />

      <main className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-2 text-sm text-muted-foreground">
            <li>
              <Link href="/" className="hover:text-foreground hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/blog" className="hover:text-foreground hover:underline">
                Blog
              </Link>
            </li>
          </ol>
        </nav>

        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">{hub.name}</h1>
          <p className="mt-3 text-muted-foreground leading-relaxed whitespace-pre-line">
            {introOf(hub)}
          </p>
        </header>

        <PostList posts={hub.posts} />
      </main>
    </div>
  );
}
