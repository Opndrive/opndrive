import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { getPostBySlug, getAllPostSlugs, getRelatedPosts } from '@/lib/wordpress/service';
import { formatDate } from '@/lib/wordpress/utils';
import { BlogPostContent, RelevantBlogPosts } from '@/components/blog';
import BlogNavbar from '@/components/blog/blog-navbar';
import { BlogFAQSection } from '@/components/blog/blog-faq-section';
import { BlogCTASection } from '@/components/blog/blog-cta-section';

// Revalidate every 60 seconds
export const revalidate = 60;

// Generate static params for all blog posts
export async function generateStaticParams() {
  const slugs = await getAllPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

// Generate metadata for each post
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  return {
    title: post.seo.title,
    description: post.seo.description,
    keywords: post.tags.map((tag) => tag.name),
    authors: [{ name: post.author.name }],
    openGraph: {
      title: post.seo.ogTitle || post.seo.title,
      description: post.seo.ogDescription || post.seo.description,
      type: 'article',
      publishedTime: post.publishedDate,
      modifiedTime: post.modifiedDate,
      authors: [post.author.name],
      images: post.seo.ogImage
        ? [
            {
              url: post.seo.ogImage,
              alt: post.featuredImage?.alt || post.title,
            },
          ]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.seo.ogTitle || post.seo.title,
      description: post.seo.ogDescription || post.seo.description,
      images: post.seo.ogImage ? [post.seo.ogImage] : [],
    },
    alternates: {
      canonical: post.seo.canonical || `/blog/${post.slug}`,
    },
    robots: {
      index: !post.seo.noindex,
      follow: !post.seo.nofollow,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  // Fetch related posts
  const relatedPosts = await getRelatedPosts(slug, 3);

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <BlogNavbar />

      {/* Static Header Spacer */}
      <div id="static-navbar" className="h-1"></div>

      {/* Article Container */}
      <article className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Title */}
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground text-center mb-6 leading-tight">
          {post.title}
        </h1>

        {/* Meta Info */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-8">
          <span>by {post.author.name}</span>
          <span>|</span>
          <time dateTime={post.publishedDate}>{formatDate(post.publishedDate)}</time>
        </div>

        {/* Featured Image */}
        {post.featuredImage ? (
          <div className="relative w-full aspect-[2/1] rounded-2xl overflow-hidden bg-muted mb-12">
            <Image
              src={post.featuredImage.url}
              alt={post.featuredImage.alt}
              fill
              className="object-cover"
              priority
              sizes="(max-width: 768px) 100vw, 896px"
            />
          </div>
        ) : (
          <></>
        )}

        {/* Content Layout with Sticky Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
          {/* Left Sidebar - Sticky CTA */}
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-foreground text-center">
                    Ready to manage your S3 storage?
                  </h3>

                  <p className="text-sm text-muted-foreground text-center leading-relaxed">
                    Open-source modern UI for S3 Compatible Storage Services with full control over
                    your data.
                  </p>

                  <Link
                    href="/connect"
                    className="block w-full bg-primary hover:bg-primary/90 text-primary-foreground text-center font-semibold py-3 px-6 rounded-xl transition-colors"
                  >
                    Get Started
                  </Link>
                </div>
              </div>
            </div>
          </aside>

          {/* Right Content */}
          <div className="min-w-0 ">
            {/* Post Content */}
            <BlogPostContent content={post.content} />
          </div>
        </div>
      </article>

      {/* Relevant Blog Posts Section */}
      <div className="overflow-x-hidden">
        <RelevantBlogPosts posts={relatedPosts} />
      </div>

      {/* FAQ Section */}
      <div className="overflow-x-hidden">
        <BlogFAQSection />
      </div>

      {/* CTA Section */}
      <div className="overflow-x-hidden">
        <BlogCTASection />
      </div>
    </div>
  );
}
