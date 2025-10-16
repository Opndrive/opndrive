import { Metadata } from 'next';
import { getRecentPosts } from '@/lib/wordpress/service';
import { BlogCard } from '@/components/blog/blog-card';

import BlogNavbar from '@/components/blog/blog-navbar';
import FAQSection from '@/features/landing-page/components/faq-section';
import CTASection from '@/features/landing-page/components/cta-section';
import { BlogPagination, FeaturedBlogPost } from '@/components/blog';

// Revalidate every 60 seconds
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Blog | Opndrive',
  description:
    'Read the latest articles, tutorials, and insights about cloud storage, file management, and productivity.',
  openGraph: {
    title: 'Blog | Opndrive',
    description:
      'Read the latest articles, tutorials, and insights about cloud storage, file management, and productivity.',
    type: 'website',
  },
};

const POSTS_PER_PAGE = 10;

interface BlogPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function BlogPage({ searchParams }: BlogPageProps) {
  const params = await searchParams;
  const currentPage = parseInt(params.page || '1', 10);
  const allPosts = await getRecentPosts(50); // Fetch more posts for pagination

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

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <BlogNavbar />

      {/* Static Header Spacer */}
      <div id="static-navbar" className="h-1"></div>

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
