import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { getPostBySlug, getAllPostSlugs, getRelatedPosts } from '@/lib/wordpress/service';
import { formatDate, getReadingTime } from '@/lib/wordpress/utils';
import { BlogPostContent, RelevantBlogPosts } from '@/components/blog';
import BlogNavbar from '@/components/blog/blog-navbar';
import { BlogFAQSection } from '@/components/blog/blog-faq-section';
import { BlogCTASection } from '@/components/blog/blog-cta-section';
import { StructuredData } from '@/components/seo';
import {
  generateArticleSchema,
  generateBlogPostingSchema,
  generateBreadcrumbSchema,
  getAbsoluteUrl,
  optimizeDescription,
  generateKeywords,
} from '@/lib/seo';
import { isBlogEnabled } from '@/config/features';

// Revalidate every 60 seconds
export const revalidate = 60;

// Generate static params for all blog posts
export async function generateStaticParams() {
  if (!isBlogEnabled()) {
    return [];
  }

  try {
    const slugs = await getAllPostSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch (error) {
    console.error('Error generating static params for blog posts:', error);
    return [];
  }
}

// Generate metadata for each post
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  // Early return if blog is disabled
  if (!isBlogEnabled()) {
    return {
      title: 'Blog Not Available',
    };
  }

  const { slug } = await params;

  let post;
  try {
    post = await getPostBySlug(slug);
  } catch (error) {
    console.error('Error fetching blog post metadata:', error);
    return {
      title: 'Post Not Found',
    };
  }

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  // Optimize description length for SEO
  const optimizedDescription = optimizeDescription(post.seo.description);

  // Generate comprehensive keywords
  const keywords = generateKeywords(
    post.tags.map((t) => t.name),
    post.categories.map((c) => c.name),
    ['cloud storage', 'file management', 's3 storage', 'tutorial', 'guide']
  );

  // Absolute URLs for Open Graph
  const absoluteUrl = getAbsoluteUrl(`/blog/${post.slug}`);
  const ogImageUrl = post.seo.ogImage || post.featuredImage?.url;

  return {
    title: post.seo.title,
    description: optimizedDescription,
    keywords: keywords,
    authors: [
      {
        name: post.author.name,
        url: getAbsoluteUrl('/blog'),
      },
    ],
    creator: post.author.name,
    publisher: 'Opndrive',

    // Open Graph
    openGraph: {
      title: post.seo.ogTitle || post.seo.title,
      description: post.seo.ogDescription || optimizedDescription,
      type: 'article',
      publishedTime: post.publishedDate,
      modifiedTime: post.modifiedDate,
      authors: [post.author.name],
      tags: post.tags.map((tag) => tag.name),
      section: post.categories[0]?.name,
      url: absoluteUrl,
      siteName: 'Opndrive',
      locale: 'en_US',
      images: ogImageUrl
        ? [
            {
              url: ogImageUrl,
              width: post.featuredImage?.width || 1200,
              height: post.featuredImage?.height || 630,
              alt: post.featuredImage?.alt || post.title,
              type: 'image/jpeg',
            },
          ]
        : [],
    },

    // Twitter Card
    twitter: {
      card: 'summary_large_image',
      title: post.seo.ogTitle || post.seo.title,
      description: post.seo.ogDescription || optimizedDescription,
      images: ogImageUrl ? [ogImageUrl] : [],
      creator: '@opndrive',
      site: '@opndrive',
    },

    // Canonical URL
    alternates: {
      canonical: post.seo.canonical || absoluteUrl,
    },

    // Robots meta
    robots: {
      index: !post.seo.noindex,
      follow: !post.seo.nofollow,
      googleBot: {
        index: !post.seo.noindex,
        follow: !post.seo.nofollow,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },

    // Additional metadata
    category: post.categories[0]?.name,

    // Verification and other meta tags
    other: {
      'article:published_time': post.publishedDate,
      'article:modified_time': post.modifiedDate,
      'article:author': post.author.name,
      'article:section': post.categories[0]?.name || 'Blog',
      'article:tag': post.tags.map((tag) => tag.name).join(', '),
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  // Early return if blog is disabled - let layout handle 404
  if (!isBlogEnabled()) {
    return null;
  }

  const { slug } = await params;

  let post;
  try {
    post = await getPostBySlug(slug);
  } catch (error) {
    console.error('Error fetching blog post:', error);
    notFound();
  }

  if (!post) {
    notFound();
  }

  // Fetch related posts
  let relatedPosts: Awaited<ReturnType<typeof getRelatedPosts>> = [];
  try {
    relatedPosts = await getRelatedPosts(slug, 3);
  } catch (error) {
    console.error('Error fetching related posts:', error);
    relatedPosts = [];
  }

  // Generate structured data for SEO
  const articleSchema = generateArticleSchema(post);
  const blogPostingSchema = generateBlogPostingSchema(post);
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Blog', url: '/blog' },
    { name: post.title, url: `/blog/${post.slug}` },
  ]);

  // Calculate reading time
  const readingTime = getReadingTime(post.content);

  return (
    <div className="min-h-screen bg-background">
      {/* Structured Data for SEO */}
      <StructuredData data={[articleSchema, blogPostingSchema, breadcrumbSchema]} />

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
          <span>|</span>
          <span>{readingTime} min read</span>
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
