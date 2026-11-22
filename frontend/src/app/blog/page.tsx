import { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import {
  blogIndexRobots,
  loadBlogIndexPosts,
  paginateBlogIndex,
  parseBlogPageParam,
} from '@/lib/wordpress/blog-index';
import { BlogCard } from '@/components/blog/blog-card';
import BlogNavbar from '@/components/blog/blog-navbar';
import FAQSection from '@/features/landing-page/components/faq-section';
import CTASection from '@/features/landing-page/components/cta-section';
import { BlogPagination } from '@/components/blog/blog-pagination';
import { FeaturedBlogPost } from '@/components/blog/featured-blog-post';
import { BlogDiscordLink } from '@/components/blog/blog-discord-link';
import { StructuredData } from '@/components/seo';
import { generateBlogSchema, generateWebSiteSchema, getAbsoluteUrl } from '@/lib/seo';
import { SEO_CONFIG } from '@/lib/seo/config';
import { pageSocialMetadata } from '@/lib/seo/social';
import { isBlogEnabled } from '@/config/features';

/*
 * No `revalidate` export: every page in this app is rendered per request (the
 * root layout reads the CSP nonce from headers()), so it never applied. The
 * WordPress responses are what is cached, by the fetch in the client.
 */

const BLOG_TITLE = 'Blog - Cloud Storage Insights & Tutorials';

/** /blog for page 1, /blog?page=N after it: the address each page answers on. */
function blogPagePath(page: number): string {
  return page === 1 ? '/blog' : `/blog?page=${page}`;
}

function baseMetadata(page: number): Metadata {
  const path = blogPagePath(page);
  // Page 2 onwards gets its own title, so the pages are not duplicates of one
  // another in search results or in a browser's history.
  const pageSuffix = page === 1 ? '' : ` (Page ${page})`;
  const social = pageSocialMetadata({
    title: `${SEO_CONFIG.blog.title}${pageSuffix}`,
    description: SEO_CONFIG.blog.description,
    path,
    image: {
      url: SEO_CONFIG.blog.ogImage,
      width: SEO_CONFIG.ogImageWidth,
      height: SEO_CONFIG.ogImageHeight,
      alt: 'Opndrive Blog',
    },
  });

  return {
    title: `${BLOG_TITLE}${pageSuffix} | Opndrive`,
    description:
      'Learn about cloud storage management, S3 best practices, file organization tips, and productivity guides. Expert tutorials and insights for managing your data effectively.',
    keywords:
      'cloud storage blog, s3 tutorials, file management tips, cloud storage guides, opndrive blog, storage optimization, data management',
    authors: [{ name: 'Opndrive Team', url: 'https://opndrive.app' }],
    creator: 'Opndrive',
    publisher: 'Opndrive',

    // The shared builder, with the blog's own image and words; the Twitter
    // handle the blog has always named on top.
    openGraph: social.openGraph,
    twitter: {
      ...social.twitter,
      creator: SEO_CONFIG.twitterCreator,
      site: SEO_CONFIG.twitterHandle,
    },

    alternates: {
      // Each page names itself. Pointing page 2 at /blog, as every page used
      // to, tells Google page 2 is a copy of page 1 - and the posts listed
      // only there lose the one index page that links to them.
      canonical: getAbsoluteUrl(path),
      types: {
        'application/rss+xml': [
          { url: getAbsoluteUrl('/blog/rss.xml'), title: 'Opndrive Blog RSS Feed' },
        ],
      },
    },
  };
}

interface BlogPageProps {
  searchParams: Promise<{ page?: string | string[] }>;
}

/**
 * Indexable only once there is something to read. An empty index says there
 * are no posts yet, which Google may report as a soft 404; see
 * lib/wordpress/blog-index for the rule, which flips by itself with the first
 * published post.
 */
export async function generateMetadata({ searchParams }: BlogPageProps): Promise<Metadata> {
  const parsed = parseBlogPageParam((await searchParams).page);
  // The page redirects these to /blog; describe the page they land on.
  const page = parsed === 'canonical' ? 1 : parsed;

  // null when WordPress could not be reached: unknown, so still indexable.
  const posts = await loadBlogIndexPosts();

  return { ...baseMetadata(page), robots: blogIndexRobots(posts?.length ?? null) };
}

export default async function BlogPage({ searchParams }: BlogPageProps) {
  // Early return if blog is disabled - let layout handle 404
  if (!isBlogEnabled()) {
    return null;
  }

  const page = parseBlogPageParam((await searchParams).page);
  // ?page=1, ?page=abc and the like are /blog under another name.
  if (page === 'canonical') {
    permanentRedirect('/blog');
  }

  // The same request generateMetadata made; cache() hands back its result.
  const loaded = await loadBlogIndexPosts();
  // A configured WordPress that did not answer: fail the request (500, which a
  // crawler retries) rather than serve an indexable page with no posts on it.
  if (loaded === null) {
    throw new Error('WordPress did not answer; the blog index cannot be shown');
  }

  // A page past the last one is a page that does not exist. It used to render
  // "No blog posts available yet" under a blog full of them.
  const view = paginateBlogIndex(loaded, page);
  if (!view) {
    notFound();
  }

  const { featured, posts, totalPages } = view;

  // Layout: First 2 rows with 2 columns (4 posts), then 2 rows with 3 columns (6 posts)
  const firstFourPosts = posts.slice(0, 4);
  const nextSixPosts = posts.slice(4, 10);

  // Generate structured data: the blog, with the posts this page lists
  const blogSchema = generateBlogSchema(featured ? [featured, ...posts] : posts);
  const websiteSchema = generateWebSiteSchema();

  return (
    <div className="min-h-screen bg-background">
      {/* Structured Data for SEO */}
      <StructuredData data={[websiteSchema, blogSchema]} />

      {/* Navbar */}
      <BlogNavbar />

      {/* Static Header Spacer */}
      <div className="h-1"></div>

      {/* Hero Section */}
      <section className="pt-16 bg-background">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 sm:mb-5 text-foreground">
            Opndrive Blog
          </h1>
          {page > 1 ? (
            <p className="text-muted-foreground">
              Page {page} of {totalPages}
            </p>
          ) : (
            <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground text-pretty">
              Guides, fixes and comparisons for running your own S3-compatible storage.
            </p>
          )}
          <BlogDiscordLink className="mt-6 justify-center" />
        </div>
      </section>

      {loaded.length === 0 ? (
        // One message for an empty blog, not two headings over nothing.
        <section className="py-16 bg-background">
          <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-muted-foreground">No posts yet. The first one is on its way.</p>
          </div>
        </section>
      ) : null}

      {/* Featured Blog Post */}
      {featured ? (
        <section className="py-14 bg-background">
          <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 text-foreground">
              Featured blog post
            </h2>
            <FeaturedBlogPost post={featured} />
          </div>
        </section>
      ) : null}

      {/* All Blog Posts. Absent while the featured post is the only one: the
          heading used to stand over "No blog posts available yet", right
          below the post it had just shown. */}
      {posts.length > 0 ? (
        <section className="py-8 sm:py-12 md:py-16 bg-background">
          <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 text-foreground">
              {page === 1 ? 'More posts' : 'All blog posts'}
            </h2>

            {/* First 2 rows with 2 columns (4 posts) */}
            {firstFourPosts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {firstFourPosts.map((post) => (
                  <BlogCard key={post.id} post={post} />
                ))}
              </div>
            ) : null}

            {/* Next 2 rows with 3 columns (6 posts) */}
            {nextSixPosts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {nextSixPosts.map((post) => (
                  <BlogCard key={post.id} post={post} />
                ))}
              </div>
            ) : null}

            {/* Pagination */}
            {totalPages > 1 ? (
              <div className="mt-12 sm:mt-16">
                <BlogPagination currentPage={page} totalPages={totalPages} />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* FAQ Section */}
      <FAQSection />

      {/* CTA Section */}
      <CTASection href="/connect" />
    </div>
  );
}
