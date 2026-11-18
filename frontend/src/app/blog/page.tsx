import { Metadata } from 'next';
import { blogIndexRobots, loadBlogIndexPosts } from '@/lib/wordpress/blog-index';
import { BlogCard } from '@/components/blog/blog-card';
import BlogNavbar from '@/components/blog/blog-navbar';
import FAQSection from '@/features/landing-page/components/faq-section';
import CTASection from '@/features/landing-page/components/cta-section';
import { BlogPagination, FeaturedBlogPost } from '@/components/blog';
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

const BLOG_SOCIAL = pageSocialMetadata({
  title: SEO_CONFIG.blog.title,
  description: SEO_CONFIG.blog.description,
  path: '/blog',
  image: {
    url: SEO_CONFIG.blog.ogImage,
    width: SEO_CONFIG.ogImageWidth,
    height: SEO_CONFIG.ogImageHeight,
    alt: 'Opndrive Blog',
  },
});

const BASE_METADATA: Metadata = {
  title: 'Blog - Cloud Storage Insights & Tutorials | Opndrive',
  description:
    'Learn about cloud storage management, S3 best practices, file organization tips, and productivity guides. Expert tutorials and insights for managing your data effectively.',
  keywords:
    'cloud storage blog, s3 tutorials, file management tips, cloud storage guides, opndrive blog, storage optimization, data management',
  authors: [{ name: 'Opndrive Team', url: 'https://opndrive.app' }],
  creator: 'Opndrive',
  publisher: 'Opndrive',

  // The shared builder, with the blog's own image and words; the Twitter handle
  // the blog has always named on top.
  openGraph: BLOG_SOCIAL.openGraph,
  twitter: {
    ...BLOG_SOCIAL.twitter,
    creator: SEO_CONFIG.twitterCreator,
    site: SEO_CONFIG.twitterHandle,
  },

  alternates: {
    canonical: getAbsoluteUrl('/blog'),
    types: {
      'application/rss+xml': [
        { url: getAbsoluteUrl('/blog/rss.xml'), title: 'Opndrive Blog RSS Feed' },
      ],
    },
  },
};

/**
 * Indexable only once there is something to read. An empty index says "No
 * blog posts available yet", which Google may report as a soft 404; see
 * lib/wordpress/blog-index for the rule, which flips by itself with the first
 * published post.
 */
export async function generateMetadata(): Promise<Metadata> {
  // null when WordPress could not be reached: unknown, so still indexable.
  const posts = await loadBlogIndexPosts();

  return { ...BASE_METADATA, robots: blogIndexRobots(posts?.length ?? null) };
}

const POSTS_PER_PAGE = 10;

interface BlogPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function BlogPage({ searchParams }: BlogPageProps) {
  // Early return if blog is disabled - let layout handle 404
  if (!isBlogEnabled()) {
    return null;
  }

  const params = await searchParams;
  const currentPage = parseInt(params.page || '1', 10);

  // The same request generateMetadata made; cache() hands back its result.
  const allPosts = (await loadBlogIndexPosts()) ?? [];

  // Separate featured post (latest)
  const featuredPost = allPosts[0];
  const remainingPosts = allPosts.slice(1);

  // Pagination logic
  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const endIndex = startIndex + POSTS_PER_PAGE;
  const paginatedPosts = remainingPosts.slice(startIndex, endIndex);
  const totalPages = Math.ceil(remainingPosts.length / POSTS_PER_PAGE);

  // Layout: First 2 rows with 2 columns (4 posts), then 2 rows with 3 columns (6 posts)
  const firstFourPosts = paginatedPosts.slice(0, 4);
  const nextSixPosts = paginatedPosts.slice(4, 10);

  const handleGetStarted = async () => {
    'use server';
    // This is a placeholder for the CTA action
  };

  // Generate structured data
  const blogSchema = generateBlogSchema();
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
          <h1 className="text-4xl md:text-5xl font-bold mb-4 sm:mb-6 text-foreground">
            Opndrive Blog
          </h1>
        </div>
      </section>

      {/* Featured Blog Post */}
      {featuredPost && (
        <section className="py-14 bg-background">
          <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 text-foreground">
              Featured blog post
            </h2>
            <FeaturedBlogPost post={featuredPost} />
          </div>
        </section>
      )}

      {/* All Blog Posts */}
      <section className="py-8 sm:py-12 md:py-16 bg-background">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 text-foreground">
            All blog posts
          </h2>

          {paginatedPosts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No blog posts available yet. Check back soon!</p>
            </div>
          ) : (
            <>
              {/* First 2 rows with 2 columns (4 posts) */}
              {firstFourPosts.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {firstFourPosts.map((post) => (
                    <BlogCard key={post.id} post={post} />
                  ))}
                </div>
              )}

              {/* Next 2 rows with 3 columns (6 posts) */}
              {nextSixPosts.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {nextSixPosts.map((post) => (
                    <BlogCard key={post.id} post={post} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-12 sm:mt-16">
              <BlogPagination currentPage={currentPage} totalPages={totalPages} />
            </div>
          )}
        </div>
      </section>

      {/* FAQ Section */}
      <FAQSection />

      {/* CTA Section */}
      <CTASection handleGetStarted={handleGetStarted} isLoading={false} />
    </div>
  );
}
