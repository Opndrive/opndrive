import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import BlogNavbar from '@/components/blog/blog-navbar';
import { PostList } from '@/components/blog/post-list';
import { StructuredData } from '@/components/seo';
import { isBlogEnabled } from '@/config/features';
import {
  generateBreadcrumbSchema,
  generateProfilePageSchema,
  getAbsoluteUrl,
  isOrganizationAuthor,
} from '@/lib/seo';
import { pageSocialMetadata } from '@/lib/seo/social';
import { isWordPressConfigured } from '@/lib/wordpress/client';
import { getAuthor } from '@/lib/wordpress/service';
import { authorPath, descriptionFromText } from '@/lib/wordpress/seo-text';

/**
 * Who writes the blog: an author's name, their bio and everything they have
 * published, newest first. Every post's byline links here.
 *
 * All of it comes from the author's WordPress profile (Users, Profile): the
 * display name, the biographical info, the website and Yoast's contact info.
 * The posts are published by the Opndrive account, so this page is usually
 * about the organisation; its structured data says so (see
 * generateProfilePageSchema).
 * An empty bio is simply left out. An author with no published posts has no
 * page: WordPress does not show them, and neither does this.
 */

/** One WordPress request per render, shared by the metadata and the page. */
const loadAuthor = cache(async (slug: string) => {
  if (!isBlogEnabled() || !isWordPressConfigured()) return null;
  return getAuthor(slug);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const author = await loadAuthor(slug);
  if (!author) return { title: 'Author Not Found' };

  const path = authorPath(author.slug);
  // Opndrive writing as itself would otherwise be named twice in one title.
  const title = isOrganizationAuthor(author)
    ? `About ${author.name}: every post on the blog`
    : `${author.name}, author at the Opndrive blog`;
  const description = author.bio
    ? descriptionFromText(author.bio)
    : `Every post ${author.name} has written for the Opndrive blog, newest first: guides and fixes for S3-compatible storage.`;

  return {
    title,
    description,
    alternates: { canonical: getAbsoluteUrl(path) },
    robots: { index: true, follow: true },
    ...pageSocialMetadata({ title, description, path }),
  };
}

export default async function AuthorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const author = await loadAuthor(slug);
  if (!author) notFound();

  const path = authorPath(author.slug);

  return (
    <div className="min-h-screen bg-background">
      <StructuredData
        data={[
          generateProfilePageSchema(author, author.posts),
          generateBreadcrumbSchema([
            { name: 'Home', url: '/' },
            { name: 'Blog', url: '/blog' },
            { name: author.name, url: path },
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

        <header className="mb-10 flex items-start gap-5">
          {author.avatar ? (
            // Through next/image, like the covers: the reader's browser asks
            // this site for it, not Gravatar or WordPress.
            <Image
              src={author.avatar}
              alt=""
              width={96}
              height={96}
              className="h-20 w-20 flex-shrink-0 rounded-full border border-border sm:h-24 sm:w-24"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground break-words">
              {author.name}
            </h1>
            {author.bio ? (
              <p className="mt-3 text-muted-foreground leading-relaxed whitespace-pre-line">
                {author.bio}
              </p>
            ) : null}
            {author.sameAs.length ? (
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {author.sameAs.map((link) => (
                  <li key={link}>
                    <a
                      href={link}
                      rel="me noopener noreferrer"
                      target="_blank"
                      className="text-primary hover:underline"
                    >
                      {new URL(link).hostname.replace(/^www\./, '')}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </header>

        <h2 className="mb-6 text-lg font-semibold text-foreground">
          {author.posts.length === 1 ? '1 post' : `${author.posts.length} posts`}
        </h2>
        <PostList posts={author.posts} />
      </main>
    </div>
  );
}
